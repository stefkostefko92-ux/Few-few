// Спонсорираните публикации във Facebook, Instagram и Threads с истинското разширение в
// реален Chromium (Playwright). Страниците са фикстури по моделите, с които Meta крие
// етикета: обикновен текст, aria-labelledby към скрит span, SVG <use> към <text>, разбъркани
// еднобуквени span-ове с примамки, етикет, дорисуван по-късно, други езици. Органичните
// публикации, „Paid partnership“ и коментарите остават. metaDebug очертава вместо да крие.
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
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

const CSS = "<style>body{font:14px sans-serif} [role=feed]>div,article,.post,[data-pressable-container]{min-height:120px;border:1px solid #ccc;margin:8px}</style>";
const FB = `<!doctype html><title>fb</title>${CSS}<div role="main"><div role="feed">
  <div id="fb-organic"><div><a href="/alice">Alice</a> <span>2 h</span></div><p><span>I was sponsored by my friend to run a marathon</span></p></div>
  <div id="fb-plain"><div><a href="/brand">Brand</a> <a href="#"><span>Sponsored</span></a></div><p>buy now</p></div>
  <div id="fb-aria"><div><a href="/brand2">Brand2</a> <span aria-labelledby="lbl1"><span> </span></span></div><p>offer</p></div>
  <div id="fb-letters"><div><a>Brand3</a> <a href="#"><span><span style="display:flex"><span style="order:3">o</span><span style="order:1">S</span><span style="order:2">p</span><span>n</span><span>s</span><span>o</span><span>r</span><span>e</span><span>d</span><span style="display:none">x</span><span style="display:none">q</span></span></span></a></div><p>deal</p></div>
  <div id="fb-svg"><div><a>Brand4</a> <svg width="60" height="12"><use href="#svgSp"></use></svg></div><p>sale</p></div>
  <div id="fb-de"><div><a>Marke</a> <span>Gesponsert</span></div><p>angebot</p></div>
  <div id="fb-late"><div><a>Brand5</a> <span id="late-slot"></span></div><p>later</p></div>
</div></div>
<span id="lbl1" style="position:absolute;left:-9999px">Sponsored</span>
<svg style="position:absolute;width:0;height:0"><text id="svgSp">Sponsored</text></svg>
<div role="article" id="fb-comment"><span>great post</span></div>
<script>setTimeout(() => { document.getElementById("late-slot").textContent = "Sponsored"; }, 900);</script>`;
const IG = `<!doctype html><title>ig</title>${CSS}<main>
  <article id="ig-ad"><header><a>brand</a> <span>Sponsored</span></header><div>photo</div></article>
  <article id="ig-org"><header><a>friend</a> <span>Paid partnership with brand</span></header><div>photo</div></article>
  <article id="ig-pl"><header><a>marka</a> <span>Sponsorowane</span></header><div>photo</div></article>
  <article id="ig-plain"><header><a>me</a></header><div>photo</div></article>
</main>`;
const TH = `<!doctype html><title>th</title>${CSS}<div id="feed">
  <div class="post" id="th-org"><div><a>user1</a> <span>1h</span></div><div><span>hello</span></div></div>
  <div class="post" id="th-ad"><div><a>brand</a> <span>Sponsored</span></div><div><span>ad text</span></div></div>
  <div class="post" id="th-org2"><div><a>user2</a></div><div><span>world</span></div></div>
  <div class="post" id="th-org3"><div><a>user3</a></div><div><span>again</span></div></div>
</div>
<div id="feed2"><div data-pressable-container="true" id="th-pc-ad"><span>Sponsored</span><p>x</p></div><div data-pressable-container="true" id="th-pc-org"><p>y</p></div></div>`;

const srv = http.createServer((q, r) => {
  const host = (q.headers.host || "").split(":")[0];
  r.setHeader("content-type", "text/html");
  r.end(host.includes("instagram") ? IG : host.includes("threads") ? TH : FB);
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;
const hosts = ["www.facebook.com", "www.instagram.com", "www.threads.com", "www.threads.net"];

const profile = mkdtempSync(join(tmpdir(), "sa-meta-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    `--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", ")}`],
});
const shown = (p, id) => p.evaluate((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== "none"; }, id);
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  await new Promise((r) => setTimeout(r, 2500));

  const fb = await ctx.newPage();
  await fb.goto(`http://www.facebook.com:${port}/`);
  await fb.waitForTimeout(1800);
  ok("facebook: plain “Sponsored” label → the post is hidden", !(await shown(fb, "fb-plain")));
  ok("facebook: aria-labelledby → a hidden span with the word", !(await shown(fb, "fb-aria")));
  ok("facebook: shuffled one-letter spans with decoys", !(await shown(fb, "fb-letters")));
  ok("facebook: SVG <use> pointing at <text>Sponsored</text>", !(await shown(fb, "fb-svg")));
  ok("facebook: German “Gesponsert”", !(await shown(fb, "fb-de")));
  ok("facebook: a label filled in later (Meta renders a post in stages)", !(await shown(fb, "fb-late")));
  ok("facebook: an organic post that merely says “sponsored” stays", await shown(fb, "fb-organic"));
  ok("facebook: comments are never touched", await shown(fb, "fb-comment"));
  await fb.close();

  const ig = await ctx.newPage();
  await ig.goto(`http://www.instagram.com:${port}/`);
  await ig.waitForTimeout(1200);
  ok("instagram: a sponsored post is hidden", !(await shown(ig, "ig-ad")));
  ok("instagram: Polish “Sponsorowane”", !(await shown(ig, "ig-pl")));
  ok("instagram: “Paid partnership” (a creator's own post) stays", await shown(ig, "ig-org"));
  ok("instagram: ordinary posts stay", await shown(ig, "ig-plain"));
  await ig.close();

  for (const h of ["www.threads.com", "www.threads.net"]) {
    const th = await ctx.newPage();
    await th.goto(`http://${h}:${port}/`);
    await th.waitForTimeout(1200);
    ok(`${h}: a sponsored post among look-alike posts is hidden, its neighbours stay`,
      !(await shown(th, "th-ad")) && (await shown(th, "th-org")) && (await shown(th, "th-org2")) && (await shown(th, "th-org3")));
    ok(`${h}: a pressable container with the label`, !(await shown(th, "th-pc-ad")) && (await shown(th, "th-pc-org")));
    await th.close();
  }

  // metaDebug: outline instead of hide, with the reason
  await sw.evaluate(() => chrome.storage.local.set({ metaDebug: true }));
  const dbg = await ctx.newPage();
  await dbg.goto(`http://www.facebook.com:${port}/`);
  await dbg.waitForTimeout(1500);
  const why = await dbg.evaluate(() => ({ shown: getComputedStyle(document.getElementById("fb-letters")).display !== "none", why: document.getElementById("fb-letters").getAttribute("data-tbab-why") }));
  ok(`metaDebug: the post stays visible, outlined, with the reason (${why.why})`, why.shown && why.why === "letters");
  await dbg.close();
  await sw.evaluate(() => chrome.storage.local.set({ metaDebug: false }));

  // an allowed site: nothing is hidden
  await sw.evaluate(() => chrome.storage.local.set({ allowlist: ["facebook.com"] }));
  const al = await ctx.newPage();
  await al.goto(`http://www.facebook.com:${port}/`);
  await al.waitForTimeout(1500);
  ok("allowed site: sponsored posts are left alone", await shown(al, "fb-plain"));
  await al.close();
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
