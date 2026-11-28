// agents-app.dom.test.mjs — поведението на страницата „Агентите“ в истински Chromium.
//
// Прегледът на PR #498 (Кодаджията, Дизайнера) намери бъгове, които се виждат само в работещата страница:
// смяна на таб по време на отговор губеше съобщения и презаписваше историята; „Изчисти“ по време на
// отговор оставяше сираче; развален адрес чупеше зареждането; стриймингът се четеше на парчета от
// екранния четец; портретите тежаха 0,9 MB в първото зареждане. Тук `window.claude` е мок по договора
// (contract 0.2.99): `sample` стриймва през onText({text}) и при abort отхвърля {code:"cancelled", text?};
// `db` пази документи в паметта на страницата. Без Chromium тестът се прескача с причина — не „минава“.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../lib/browser.mjs";
import { buildApp, repoReader } from "./build-artifact.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");

// Обвивката, която публикуването слага (charset, viewport, `[hidden]`).
const wrap = (inner) => `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>${inner}</body></html>`;

// Мокът на `window.claude` — по типовете на sample.d.ts и db.d.ts.
const MOCK = `
  window.__store = {}; window.__calls = 0; window.__delay = 120;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.claude = { use: async (cap) => {
    if (cap === "sample") return async (input, opts = {}) => {
      if (window.__fail) throw Object.assign(new Error(window.__fail), { code: window.__fail });
      const n = ++window.__calls; const words = ["Отговор", " " + n, " е", " готов."]; let acc = "";
      for (const w of words) {
        await sleep(window.__delay);
        if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled", text: acc || undefined });
        acc += w; if (opts.onText) opts.onText({ text: acc, delta: w });
      }
      return { text: acc, truncated: false };
    };
    if (cap === "db") return { collection: (path) => ({ doc: (id) => ({
      get: async () => { const v = window.__store[path + "/" + id]; return { exists: !!v, data: () => JSON.parse(JSON.stringify(v)) }; },
      set: async (v) => { await sleep(5); window.__store[path + "/" + id] = JSON.parse(JSON.stringify(v)); },
    }) }) };
    if (cap === "user") return { id: async () => "u1" };
    return null;
  } };`;

let server, base, browser, skip = null, built;

before(async () => {
  built = buildApp(DASH, null, repoReader(null, ROOT));
  const files = { "/index.html": ["text/html; charset=utf-8", wrap(built.html)], "/portraits.json": ["application/json", built.portraitsJson] };
  server = createServer((req, res) => {
    const f = files[new URL(req.url, "http://x").pathname];
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": f[0] }); res.end(f[1]);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  const r = await launchChromium();
  if (r.error) skip = `няма Chromium: ${r.error}`; else browser = r.browser;
});
after(async () => { await browser?.close(); server?.close(); });

async function page(hash, opts = {}) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript(MOCK);
  await p.goto(base + hash);
  return { p, ctx, errors };
}
const turnsOf = (p, id) => p.evaluate((id) => (window.__store[`data/users/u1/chat-${id}`] || { turns: [] }).turns, id);
const readyChat = (p) => p.waitForFunction(() => /пази само за теб/.test(document.querySelector(".chat-tools")?.textContent || ""));
async function say(p, text) { await p.fill(".composer textarea", text); await p.click(".composer .btn:not(.ghost)"); }

test("смяна на таб по време на отговор: нищо не се губи тихо и историята не се презаписва", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await readyChat(p);
  await say(p, "първо");
  await p.waitForSelector(".msg.ag");
  await p.click('.tab >> text="Профил"');
  await p.click('.tab >> text="Чат"');
  await readyChat(p);
  await say(p, "второ");
  await p.waitForFunction(() => /готов\./.test([...document.querySelectorAll(".msg.ag")].pop()?.textContent || ""));
  await p.waitForTimeout(100);
  const turns = await turnsOf(p, "kodadjiyata");
  const users = turns.filter((x) => x.role === "user").map((x) => x.content);
  assert.deepEqual(users, ["първо", "второ"], `съобщенията на собственика: ${JSON.stringify(turns)}`);
  assert.equal(turns.at(-1).role, "assistant");
  assert.match(turns.at(-1).content, /готов\./);
  const shown = await p.$$eval(".msg.me", (n) => n.map((x) => x.textContent));
  assert.deepEqual(shown, ["първо", "второ"], "видимата история = записаната");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("смяна на агент по време на отговор: отговорът не отива при другия агент", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await readyChat(p);
  await say(p, "за кода");
  await p.waitForSelector(".msg.ag");
  await p.evaluate(() => { location.hash = "dizayner.chat"; });
  await readyChat(p);
  await p.waitForTimeout(700);
  assert.deepEqual(await turnsOf(p, "dizayner"), [], "чатът на Дизайнера е празен");
  assert.equal(await p.$$eval(".msg", (n) => n.length), 0, "в панела на Дизайнера няма чужди съобщения");
  const k = await turnsOf(p, "kodadjiyata");
  assert.equal(k[0]?.content, "за кода");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("„Изчисти“ по време на отговор: историята остава празна, без сираче „(спряно)“", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await readyChat(p);
  await say(p, "нещо дълго");
  await p.waitForFunction(() => /Отговор/.test(document.querySelector(".msg.ag")?.textContent || ""));
  await p.click(".chat-tools .ghost");
  await p.click(".chat-tools .ghost");
  await p.waitForTimeout(700);
  assert.deepEqual(await turnsOf(p, "kodadjiyata"), []);
  assert.equal(await p.$$eval(".msg", (n) => n.length), 0, "панелът е празен");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("развален адрес (#%E0) не чупи страницата", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#%E0");
  await p.waitForSelector(".card");
  assert.ok((await p.$$(".card")).length >= 30);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("достъпност: стриймингът е зает и тих; готовият отговор се казва веднъж", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await readyChat(p);
  assert.equal(await p.$eval(".msgs", (n) => n.getAttribute("aria-live")), null, "историята не е live регион");
  await say(p, "здравей");
  await p.waitForFunction(() => /Отговор/.test(document.querySelector(".msg.ag")?.textContent || ""));
  assert.equal(await p.$eval(".msg.ag", (n) => n.getAttribute("aria-busy")), "true");
  await p.waitForFunction(() => /готов\./.test(document.querySelector('.chat [role="status"]')?.textContent || ""));
  assert.equal(await p.$eval(".msg.ag", (n) => n.getAttribute("aria-busy")), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("портретите: не са в първото зареждане; профилът ги взима от portraits.json", async (t) => {
  const masc = JSON.parse(built.html.match(/<script type="application\/json" id="app-mascots">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(masc.portraits || {}).length, 0, "портретите не са вградени");
  const portraits = JSON.parse(built.portraitsJson);
  assert.ok(Object.keys(portraits).length >= built.agents, "портрет за всеки агент в portraits.json");
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata");
  await p.waitForFunction((src) => document.querySelector(".hero .ava img")?.getAttribute("src") === src, portraits.kodadjiyata);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("„Спри“: частта, която е дошла, остава с „(спряно)“; бутонът се връща на „Изпрати“", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await p.evaluate(() => { window.__delay = 200; });
  await readyChat(p);
  await say(p, "спри ме");
  await p.waitForFunction(() => /Отговор/.test(document.querySelector(".msg.ag")?.textContent || ""));
  assert.equal(await p.textContent(".composer .btn:not(.ghost)"), "Спри");
  await p.click(".composer .btn:not(.ghost)");
  await p.waitForFunction(() => document.querySelector(".composer .btn:not(.ghost)")?.textContent === "Изпрати");
  await p.waitForTimeout(50);
  const turns = await turnsOf(p, "kodadjiyata");
  assert.equal(turns.length, 2);
  assert.match(turns[1].content, /^Отговор[\s\S]*\(спряно\)$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("грешка от Claude (rate_limited) се показва и не изчезва при прерисуването", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#kodadjiyata.chat");
  await readyChat(p);
  await p.evaluate(() => { window.__fail = "rate_limited"; });
  await say(p, "здрасти");
  await p.waitForSelector(".msg.err");
  assert.match(await p.textContent(".msg.err"), /лимитът/);
  assert.equal(await p.$eval(".composer textarea", (n) => n.disabled), false, "rate_limited не заключва чата");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("профилът на всеки таб е без „null“/„undefined“ в текста", async (t) => {
  if (skip) return t.skip(skip);
  const { p, ctx, errors } = await page("#ai-djiyata");
  for (const label of ["Профил", "Умения", "Учене", "Чат"]) {
    await p.click(`.tab >> text="${label}"`);
    await p.waitForFunction((l) => document.querySelector('.tab[aria-selected="true"]')?.textContent === l, label);
    // `replaceChildren(null)` пише „null“ като голи текстови възли — профилът няма такива
    const stray = await p.$eval("#profile", (n) => [...n.childNodes].filter((c) => c.nodeType === 3 && c.data.trim()).map((c) => c.data));
    assert.deepEqual(stray, [], `таб ${label}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
