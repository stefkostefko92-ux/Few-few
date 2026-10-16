// Достъпност на страниците на разширението в реален Chromium: axe (WCAG 2.0/2.1/2.2 A и AA +
// best-practice) върху popup (и с картата за отзив), настройки, „Добре дошли“ и „Сайтът е счупен?“, в двете теми.
// Featured badge-ът на Chrome Web Store иска „intuitive user experience“ — нула нарушения.
// axe-core не е зависимост на пакета: път през AXE_PATH или axe-core до Playwright (npm root -g).
// Без него — SKIP (с PW_REQUIRED=1 — грешка). `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium, axePath = process.env.AXE_PATH;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}
if (!axePath) { try { axePath = require.resolve("axe-core/axe.min.js"); } catch {} }
if (!axePath || !existsSync(axePath)) {
  console.log("SKIP: axe-core not available (AXE_PATH or axe-core next to playwright)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}
const AXE = readFileSync(axePath, "utf8");

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

// the popup is audited as it opens over a website (site row, "Site broken?", the review card)
const srv = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end("<!doctype html><title>news</title><p>news</p>"); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "sa-a11y-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  const site = await ctx.newPage(); await site.goto(`http://127.0.0.1:${srv.address().port}/news`);
  // popup+review: the review card is up (≥ 7 days, ≥ 1000 blocked) — the bottom sheet and what it makes inert
  const due = () => sw.evaluate(() => chrome.storage.local.set({ installedAt: Date.now() - 8 * 86400000, blockedTotal: 54321, review: {}, reviewAsk: true }));
  // popup+undo: the picker hid something on this site — ↶ N next to the picker (5.5.0)
  const undo = () => sw.evaluate(() => chrome.storage.local.set({ customHidden: { "127.0.0.1": [".x", ".y"] } }));
  const pages = [["popup", "popup/popup.html", 320, 600], ["popup+review", "popup/popup.html", 320, 600, due, "review"], ["popup+undo", "popup/popup.html", 320, 600, undo, "undoBtn"], ["settings", "options/options.html", 1280, 900], ["welcome", "welcome/welcome.html", 1280, 900], ["report", "report/report.html", 900, 900]];
  for (const theme of ["carbon", "light"]) {
    await sw.evaluate((t) => chrome.storage.local.set({ theme: t, review: { never: true } }), theme);
    for (const [name, path, w, h, seed, mustShow] of pages) {
      if (seed) await seed();
      const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h });
      await p.goto(`chrome-extension://${id}/${path}`); await p.waitForTimeout(800);
      if (path.startsWith("popup/")) { await site.bringToFront(); await p.reload(); await p.waitForTimeout(800); }
      if (seed && await p.evaluate((i) => document.getElementById(i).hidden, mustShow)) { ok(`${name} [${theme}]: #${mustShow} is shown`, false); await p.close(); continue; }
      if (seed) await sw.evaluate(() => chrome.storage.local.set({ review: { never: true }, customHidden: {} }));
      await p.evaluate(AXE); // evaluate is not subject to the page's CSP (script-src 'self')
      const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }))
        .violations.map((x) => `${x.id} ×${x.nodes.length} (${x.nodes[0].target.join(" ")})`));
      ok(`axe ${name} [${theme}]: ${v.length ? v.join("; ") : "no violations"}`, v.length === 0);
      await p.close();
    }
  }
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
