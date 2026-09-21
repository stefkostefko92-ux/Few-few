// Реален Chromium (Playwright) срещу cookies.js + cookies.css върху фикстури на
// consent мениджъри. Не е в `npm test` (CI няма Playwright) — `npm run test:browser`,
// с PW_ROOT=$(npm root -g) когато Playwright е глобален.
//   1. CMP с Reject бутон + backdrop + scroll lock + блърнат wrapper → кликнато, всичко чисто
//   2. CMP без бутони (само банер) + veil + inert + lock → банерът скрит, страницата ползваема
//   3. Контрол: няма банер, отворен легитимен модал (Bootstrap) → НИЩО не се пипа
//   4. Контрол: няма банер, приложение с body{overflow:hidden} → НИЩО не се пипа
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(0); }

const css = readFileSync(join(ROOT, "cookies.css"), "utf8");
const js = readFileSync(join(ROOT, "cookies.js"), "utf8");
const chromeStub = `window.__clicks=[];window.chrome={storage:{local:{get:(k,cb)=>cb({enabled:true,features:{cookies:true}})},onChanged:{addListener(){}}}};`;

const page = (body, extraCss = "") => `<!doctype html><html><head><style>
  body{margin:0;min-height:3000px} #app{min-height:3000px} ${extraCss}</style></head><body>${body}</body></html>`;

const FIXTURES = {
  "/cmp-button": page(`
    <div id="app" class="is-blurred"><h1>Article</h1><p>${"text ".repeat(200)}</p></div>
    <div class="cookie-overlay" id="veil"></div>
    <div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" role="dialog"><p>We use cookies</p>
      <button id="onetrust-accept-btn-handler" onclick="__clicks.push('accept')">Accept</button>
      <button id="onetrust-reject-all-handler" onclick="__clicks.push('reject');document.getElementById('onetrust-consent-sdk').remove();document.getElementById('veil').remove();document.body.classList.remove('modal-open');document.getElementById('app').classList.remove('is-blurred')">Reject all</button>
    </div></div>
    <script>document.body.classList.add('modal-open');</script>`,
    `body.modal-open{overflow:hidden} .is-blurred{filter:blur(6px)} #veil{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998} #onetrust-consent-sdk{position:fixed;inset:auto 0 0 0;background:#fff;z-index:9999}`),
  "/cmp-nobutton": page(`
    <div id="app" inert><h1>Article</h1><p>${"text ".repeat(200)}</p></div>
    <div class="site-veil" id="veil"></div>
    <div class="cookie-notice" id="notice"><p>We use cookies. By continuing you agree.</p></div>
    <script>document.body.classList.add('no-scroll');document.body.style.position='fixed';</script>`,
    `body.no-scroll{overflow:hidden} #veil{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:9998} #notice{position:fixed;bottom:0;left:0;right:0;background:#fff;z-index:9999;height:80px}`),
  "/control-modal": page(`
    <div id="app"><h1>Article</h1><p>${"text ".repeat(200)}</p></div>
    <div class="modal-backdrop" id="bd"></div>
    <div class="modal" id="m" role="dialog"><h2>Sign in</h2><p>Enter your details to continue reading this article on our site.</p><input placeholder="email"><button>Continue</button></div>
    <script>document.body.classList.add('modal-open');</script>`,
    `body.modal-open{overflow:hidden} #bd{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1040} #m{position:fixed;top:20%;left:30%;width:40%;background:#fff;z-index:1050}`),
  "/control-app": page(`<div id="app" style="position:fixed;inset:0;overflow:auto"><h1>Map app</h1></div>`, `html,body{overflow:hidden;height:100%}`),
};

const server = http.createServer((req, res) => {
  const html = FIXTURES[req.url.split("?")[0]];
  if (!html) { res.statusCode = 404; return res.end("nf"); }
  res.setHeader("content-type", "text/html");
  res.end(html.replace("</head>", `<style>${css}</style></head>`).replace("<body>", `<body><script>${chromeStub}</script>`).replace("</body>", `<script>${js}</script></body>`));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const state = async (p) => p.evaluate(() => {
    const cs = (el) => el && getComputedStyle(el);
    const html = document.documentElement, body = document.body;
    const g = (id) => document.getElementById(id);
    return {
      clicks: window.__clicks,
      seen: html.classList.contains("tbab-cookies-seen"),
      hard: html.classList.contains("tbab-cookies-hard"),
      bodyOverflow: cs(body).overflowY, htmlOverflow: cs(html).overflowY, bodyPos: cs(body).position,
      bodyClasses: [...body.classList],
      veil: g("veil") ? cs(g("veil")).display : "removed",
      bd: g("bd") ? cs(g("bd")).display : "removed",
      notice: g("notice") ? { display: cs(g("notice")).display, visibility: cs(g("notice")).visibility } : "removed",
      appFilter: g("app") ? cs(g("app")).filter : null,
      appInert: g("app") ? g("app").hasAttribute("inert") : null,
      modal: g("m") ? cs(g("m")).display : "removed",
      canScroll: (window.scrollTo(0, 500), window.scrollY > 0),
    };
  });

  // 1
  let p = await ctx.newPage(); await p.goto(origin + "/cmp-button"); await p.waitForTimeout(1200);
  let s = await state(p);
  ok("cmp-button: Reject clicked (not Accept)", s.clicks.join() === "reject");
  ok("cmp-button: backdrop gone", s.veil === "removed");
  ok("cmp-button: page scrolls again", s.bodyOverflow !== "hidden" && s.canScroll);
  ok("cmp-button: blur removed from wrapper", !/blur/.test(s.appFilter || ""));
  await p.close();

  // 2
  p = await ctx.newPage(); await p.goto(origin + "/cmp-nobutton"); await p.waitForTimeout(1200);
  s = await state(p);
  ok("cmp-nobutton: banner cloaked immediately (visibility hidden)", s.notice !== "removed" && s.notice.visibility === "hidden");
  ok("cmp-nobutton: veil (fixed, backdrop-filter, no content) removed", s.veil === "none");
  ok("cmp-nobutton: scroll lock lifted (class + body position:fixed)", s.bodyOverflow !== "hidden" && s.bodyPos !== "fixed" && s.canScroll);
  ok("cmp-nobutton: inert removed from page wrapper", s.appInert === false);
  await p.waitForTimeout(3500);
  s = await state(p);
  ok("cmp-nobutton: after the click window the banner is display:none", s.hard && s.notice.display === "none");
  await p.close();

  // 3
  p = await ctx.newPage(); await p.goto(origin + "/control-modal"); await p.waitForTimeout(5000);
  s = await state(p);
  ok("control-modal: no banner seen", !s.seen);
  ok("control-modal: Bootstrap backdrop untouched", s.bd === "block");
  ok("control-modal: modal + scroll lock untouched", s.modal === "block" && s.bodyOverflow === "hidden" && s.bodyClasses.includes("modal-open"));
  await p.close();

  // 4
  p = await ctx.newPage(); await p.goto(origin + "/control-app"); await p.waitForTimeout(5000);
  s = await state(p);
  ok("control-app: body overflow:hidden of a full-screen app untouched", !s.seen && s.bodyOverflow === "hidden" && s.htmlOverflow === "hidden");
  await p.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
