// Опасни сайтове с истинското разширение в реален Chromium (Playwright): отварянето на домейн от
// URLhaus отива на страницата-предупреждение (а не на грешката на браузъра), „Продължи въпреки
// това“ пуска само този сайт до затваряне на браузъра, в чужда рамка страницата не прави нищо,
// разрешен сайт и изключен превключвател не се прекъсват. Домейнът е от истинския списък,
// пренасочен към локален сървър (--host-resolver-rules) — нищо не излиза навън.
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

// a real entry of the bundled list, and an ordinary site that frames the warning page
const rules = JSON.parse(readFileSync(join(ROOT, "rules", "urlhaus.json"), "utf8"));
const BAD = rules.flatMap((r) => r.condition.requestDomains || []).find((d) => /^[a-z0-9-]+\.(com|net|org)$/.test(d));
const seen = [];
const srv = http.createServer((q, r) => {
  const host = (q.headers.host || "").split(":")[0];
  seen.push(host + q.url);
  r.setHeader("content-type", "text/html");
  if (host === "www.frame-site.org") return r.end(`<!doctype html><title>frame</title><iframe id="f" src="${q.url.slice(3)}"></iframe>`);
  r.end(`<!doctype html><title>page of ${host}</title><h1>${host}</h1>`);
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;

const profile = mkdtempSync(join(tmpdir(), "sa-danger-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    `--host-resolver-rules=MAP ${BAD} 127.0.0.1:${port}, MAP www.${BAD} 127.0.0.1:${port}, MAP www.frame-site.org 127.0.0.1:${port}`],
});
try {
  ok(`a test domain from the bundled URLhaus list (${BAD})`, !!BAD);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  const id = sw.url().split("/")[2];
  // the warning rule is armed once the SW has read the list (fresh install: on by default)
  for (let i = 0; i < 50; i++) {
    const n = await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).filter((r) => r.id >= 69000 && r.id < 69050).length);
    if (n) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const f = (await sw.evaluate(() => chrome.storage.local.get("features"))).features;
  ok("a new install has malware protection on", f && f.malware === true);

  const p = await ctx.newPage();
  seen.length = 0;
  await p.goto(`http://www.${BAD}:${port}/some/page?x=1`).catch(() => {});
  await p.waitForTimeout(800);
  ok(`opening it shows the warning page, with the address after # (${p.url().slice(0, 90)})`,
    p.url().startsWith(`chrome-extension://${id}/blocked/blocked.html#http://www.${BAD}:${port}/some/page?x=1`));
  ok("…the site itself was never contacted", !seen.some((s) => s.includes("/some/page")));
  ok(`…it names the site (“${await p.textContent("#host")}”)`, (await p.textContent("#host")) === `www.${BAD}`);
  ok("…and links to the URLhaus entry", (await p.getAttribute("#why", "href")) === `https://urlhaus.abuse.ch/browse.php?search=www.${encodeURIComponent(BAD)}`);

  await p.click("#go");
  await p.waitForTimeout(1200);
  ok(`“Continue anyway” opens the page (${p.url().slice(0, 70)})`, p.url() === `http://www.${BAD}:${port}/some/page?x=1` && seen.some((s) => s.includes("/some/page")));
  const sess = await sw.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  ok("…through one session rule for that host, main_frame only", sess.length === 1 && sess[0].action.type === "allow" && sess[0].condition.requestDomains.join() === `www.${BAD}` && sess[0].condition.resourceTypes.join() === "main_frame");
  await p.goto(`http://www.${BAD}:${port}/again`).catch(() => {});
  await p.waitForTimeout(500);
  ok("…and the next visit in this session goes straight through", p.url() === `http://www.${BAD}:${port}/again`);
  await p.close();

  // the SW lets only a listed host through, only http(s)
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${id}/options/options.html`);
  const ask = (url) => opt.evaluate((u) => new Promise((r) => chrome.runtime.sendMessage({ type: "proceedDangerous", url: u }, r)), url);
  ok("“Continue” for a site that is not on the list is refused", (await ask("https://www.example.org/")).ok === false);
  ok("…and for anything but http(s)", (await ask(`javascript:alert(1)//${BAD}`)).ok === false && (await ask(`file:///${BAD}`)).ok === false);

  // framed by another site: the page does nothing (no click-jacking of “Continue”)
  const fr = await ctx.newPage();
  await fr.goto(`http://www.frame-site.org:${port}/f/chrome-extension://${id}/blocked/blocked.html#http://${BAD}/`).catch(() => {});
  await fr.waitForTimeout(800);
  const frame = fr.frames().find((x) => x !== fr.mainFrame() && x.url().startsWith(`chrome-extension://${id}/blocked/`));
  const framed = frame ? await frame.evaluate(() => document.documentElement.textContent.trim().length).catch(() => -1) : -2;
  ok(`in a frame of another site the warning page shows nothing (${framed})`, framed === 0);
  await fr.close();

  // switch off → the site opens
  await opt.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: "setFeatures", features: { malware: false } }, r)));
  await opt.waitForTimeout(600);
  ok("switch off → no warning rule left", (await sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).filter((r) => r.id >= 69000 && r.id < 69050).length)) === 0);
  const p2 = await ctx.newPage();
  await p2.goto(`http://${BAD}:${port}/off`).catch(() => {});
  await p2.waitForTimeout(500);
  ok("…and the site opens", p2.url() === `http://${BAD}:${port}/off`);
  await p2.close();

  // on again, but the site is allowed: an allowed site is never interrupted
  await opt.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: "setFeatures", features: { malware: true } }, r)));
  await opt.evaluate((h) => new Promise((r) => chrome.runtime.sendMessage({ type: "setAllow", host: h, allow: true }, r)), BAD);
  await opt.waitForTimeout(800);
  const p3 = await ctx.newPage();
  await p3.goto(`http://${BAD}:${port}/allowed`).catch(() => {});
  await p3.waitForTimeout(500);
  ok("an allowed site opens without the warning", p3.url() === `http://${BAD}:${port}/allowed`);
  await p3.close();
  await opt.close();
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
