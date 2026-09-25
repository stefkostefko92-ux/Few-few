// Реален Chromium (Playwright) срещу cookies.js + cookies.css върху фикстури.
// Не е в `npm test` (CI няма Playwright) — `npm run test:browser`, с
// PW_ROOT=$(npm root -g), когато Playwright е глобален.
//   CMP с Reject бутон + backdrop + scroll lock + блър → кликнат Reject, всичко чисто
//   CMP без бутони + veil + inert + lock → банерът маскиран, после махнат, страницата ползваема
//   генеричен consent диалог (без CMP id-та) → Reject по текст
//   късен банер (след 6 s) → още се кликва (глобален hard клас го поглъщаше)
//   КОНТРОЛИ — нищо не се пипа: легитимен модал; full-screen приложение;
//   LinkedIn-подобни покани („Accept"/„Ignore"); повикване („Accept"/„Decline");
//   „OK/Cancel" диалог за изтриване; OAuth форма `action=…/consent` с „Allow";
//   модал, отворен СЛЕД като consent прозорецът се е затворил.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  // CI sets PW_REQUIRED=1: a missing browser there must fail, never pass as "skipped".
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

const css = readFileSync(join(ROOT, "cookies.css"), "utf8");
const js = readFileSync(join(ROOT, "cookies.js"), "utf8");
const chromeStub = `window.__clicks=[];window.chrome={storage:{local:{get:(k,cb)=>cb({enabled:true,features:{cookies:true}})},onChanged:{addListener(){}}}};`;
const rec = (name) => `onclick="__clicks.push('${name}')"`;

const page = (body, extraCss = "") => `<!doctype html><html><head><style>
  body{margin:0;min-height:3000px} #app{min-height:3000px} ${extraCss}</style></head><body>${body}</body></html>`;
const article = `<h1>Article</h1><p>${"text ".repeat(200)}</p>`;

const FIXTURES = {
  "/cmp-button": page(`
    <div id="app" class="is-blurred">${article}</div>
    <div class="cookie-overlay" id="veil"></div>
    <div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" role="dialog"><p>We use cookies</p>
      <button id="onetrust-accept-btn-handler" ${rec("accept")}>Accept</button>
      <button id="onetrust-reject-all-handler" onclick="__clicks.push('reject');document.getElementById('onetrust-consent-sdk').remove();document.getElementById('veil').remove();document.body.classList.remove('modal-open');document.getElementById('app').classList.remove('is-blurred')">Reject all</button>
    </div></div>
    <script>document.body.classList.add('modal-open');</script>`,
    `body.modal-open{overflow:hidden} .is-blurred{filter:blur(6px)} #veil{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998} #onetrust-consent-sdk{position:fixed;inset:auto 0 0 0;background:#fff;z-index:9999}`),
  "/cmp-nobutton": page(`
    <div id="app" inert>${article}</div>
    <div class="site-veil" id="veil"></div>
    <div class="cookie-notice" id="notice"><p>We use cookies. By continuing you agree.</p></div>
    <script>document.body.classList.add('no-scroll');document.body.style.position='fixed';</script>`,
    `body.no-scroll{overflow:hidden} #veil{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:9998} #notice{position:fixed;bottom:0;left:0;right:0;background:#fff;z-index:9999;height:80px}`),
  "/generic-consent": page(`
    <div id="app">${article}</div>
    <div id="dlg" role="dialog" aria-modal="true"><p>We and our partners use cookies to personalise ads.</p>
      <button ${rec("accept")}>Accept all</button>
      <button onclick="__clicks.push('reject');document.getElementById('dlg').remove();document.body.classList.remove('no-scroll')">Reject all</button></div>
    <script>document.body.classList.add('no-scroll');</script>`,
    `body.no-scroll{overflow:hidden} #dlg{position:fixed;left:10%;right:10%;bottom:10%;background:#fff;padding:20px;z-index:9999}`),
  "/late-banner": page(`
    <div id="app">${article}</div>
    <script>setTimeout(()=>{
      const v=document.createElement('div');v.id='veil';v.className='cmp-dimmer';document.body.appendChild(v);
      const w=document.createElement('div');w.id='onetrust-consent-sdk';w.innerHTML='<div id="onetrust-banner-sdk"><p>We use cookies</p><button id="onetrust-reject-all-handler">Reject all</button></div>';
      document.body.appendChild(w);document.body.classList.add('modal-open');
      document.getElementById('onetrust-reject-all-handler').onclick=()=>{__clicks.push('reject');w.remove();v.remove();document.body.classList.remove('modal-open');};
    },6000);</script>`,
    `body.modal-open{overflow:hidden} #veil{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998} #onetrust-consent-sdk{position:fixed;left:0;right:0;bottom:0;background:#fff;z-index:9999}`),
  "/control-modal": page(`
    <div id="app">${article}</div>
    <div class="modal-backdrop" id="bd"></div>
    <div class="modal" id="m" role="dialog"><h2>Sign in</h2><p>Enter your details to continue reading this article on our site.</p><input placeholder="email"><button ${rec("continue")}>Continue</button></div>
    <script>document.body.classList.add('modal-open');</script>`,
    `body.modal-open{overflow:hidden} #bd{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1040} #m{position:fixed;top:20%;left:30%;width:40%;background:#fff;z-index:1050}`),
  "/control-app": page(`<div id="app" style="position:fixed;inset:0;overflow:auto"><h1>Map app</h1></div>`, `html,body{overflow:hidden;height:100%}`),
  "/control-invitations": page(`
    <div id="app"><h1>My Network</h1><ul>
      <li>Jane Doe wants to connect <button ${rec("accept-invite")}>Accept</button> <button ${rec("ignore")}>Ignore</button></li>
      <li>John Roe wants to connect <button aria-label="Accept John's invitation" ${rec("accept-aria")}>Accept</button></li>
      <li>Team invite <button ${rec("decline-invite")}>Decline</button> <button aria-label="Reject request" ${rec("reject-aria")}>Reject</button></li>
    </ul>${article}</div>`),
  "/control-call": page(`
    <div id="app">${article}</div>
    <div role="dialog" aria-modal="true" id="call" style="position:fixed;top:10px;right:10px;background:#fff;padding:16px;z-index:10">
      <p>Incoming call from Alex</p><button ${rec("accept-call")}>Accept</button><button ${rec("decline-call")}>Decline</button></div>
    <div role="alertdialog" id="confirm" style="position:fixed;top:40%;left:40%;background:#fff;padding:16px;z-index:11">
      <p>Delete this project permanently?</p><button ${rec("ok")}>OK</button><button ${rec("cancel")}>Cancel</button></div>`),
  "/control-oauth": page(`
    <div id="app"><h1>Example App wants to access your Google Account</h1>
      <form action="https://accounts.example/o/oauth2/consent/approve" method="post" onsubmit="return false">
        <p>This will allow Example App to: read your email.</p>
        <button type="button" ${rec("allow")}>Allow</button><button type="button" ${rec("cancel")}>Cancel</button>
        <button type="button" aria-label="Allow access" ${rec("allow-aria")}>Continue</button>
      </form></div>`),
  "/control-tos": page(`
    <div id="app">${article}</div>
    <div role="dialog" aria-modal="true" style="position:fixed;inset:20% 20%;background:#fff;padding:16px;z-index:10">
      <p>We have updated our Terms of Service and Privacy Policy.</p><button ${rec("accept-tos")}>Accept</button></div>`),
  // Червен екип (F1): враждебна страница НАВИГИРА потребителя до OAuth екран на друг сайт.
  "/oauth/authorize": page(`
    <div id="app"><h1>Cookie Clicker Pro wants to access your account</h1>
      <form action="/oauth/consent" method="post" onsubmit="__clicks.push('submit');return false">
        <p>We use cookies. This will allow the app to read your email.</p>
        <button type="submit" ${rec("cancel")}>Cancel</button><button type="submit" ${rec("allow")}>Allow</button>
        <button type="submit" ${rec("accept")}>Accept</button></form></div>`),
  "/app-permissions": page(`
    <div id="app">${article}</div>
    <div role="dialog" aria-label="Consent to share cookies and profile" style="position:fixed;inset:20%;background:#fff;padding:16px;z-index:10">
      <p>Cookie Clicker Pro wants to access your profile and cookies preferences.</p>
      <form method="post" action="/grant" onsubmit="__clicks.push('submit');return false">
        <input type="submit" value="Accept" ${rec("accept-submit")}><input type="submit" value="Cancel" ${rec("cancel")}></form></div>`),
  "/consent-dialog-no-cookies": page(`
    <div id="app">${article}</div>
    <div role="dialog" aria-label="Consent to share your data" style="position:fixed;inset:20%;background:#fff;padding:16px;z-index:10">
      <p>Example App would like permission to share your data with its partners.</p>
      <button ${rec("accept-js")}>Accept</button><button ${rec("cancel")}>Cancel</button></div>`),
  "/banner-offsite-link": page(`
    <div id="app">${article}</div>
    <div class="cookie-banner" style="position:fixed;left:0;right:0;bottom:0;background:#fff;padding:16px">
      <p>We use cookies to improve your experience on our site.</p>
      <a href="https://evil.example/track?x=1" ${rec("offsite-link")}>Accept</a></div>`),
  "/modal-after-consent": page(`
    <div id="app">${article}</div>
    <div id="onetrust-consent-sdk" style="position:fixed;left:0;right:0;bottom:0;background:#fff"><div id="onetrust-banner-sdk"><p>We use cookies</p>
      <button id="onetrust-reject-all-handler" onclick="__clicks.push('reject');document.getElementById('onetrust-consent-sdk').remove()">Reject all</button></div></div>
    <script>setTimeout(()=>{
      const bd=document.createElement('div');bd.className='modal-backdrop';bd.id='bd';document.body.appendChild(bd);
      document.body.classList.add('modal-open');
    },9000);</script>`,
    `body.modal-open{overflow:hidden} .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5)}`),
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
const results = [];
const ok = (name, cond) => { results.push(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const state = (p) => p.evaluate(() => {
  const cs = (el) => el && getComputedStyle(el);
  const html = document.documentElement, body = document.body;
  const g = (id) => document.getElementById(id);
  const y0 = window.scrollY; window.scrollTo(0, 500); const canScroll = window.scrollY > 0; window.scrollTo(0, y0);
  return {
    clicks: window.__clicks,
    seen: html.classList.contains("tbab-cookies-seen"),
    bodyOverflow: cs(body).overflowY, htmlOverflow: cs(html).overflowY, bodyPos: cs(body).position,
    bodyClasses: [...body.classList],
    veil: g("veil") ? cs(g("veil")).display : "removed",
    bd: g("bd") ? cs(g("bd")).display : "removed",
    notice: g("notice") ? { display: cs(g("notice")).display, visibility: cs(g("notice")).visibility } : "removed",
    appFilter: g("app") ? cs(g("app")).filter : null,
    appInert: g("app") ? g("app").hasAttribute("inert") : null,
    modal: g("m") ? cs(g("m")).display : "removed",
    canScroll,
  };
});
async function visit(path, waitMs) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(origin + path);
  await p.waitForTimeout(waitMs);
  return { p, ctx };
}

try {
  const runs = {
    "/cmp-button": async () => {
      const { p, ctx } = await visit("/cmp-button", 1200); const s = await state(p);
      ok("cmp-button: Reject clicked (not Accept)", s.clicks.join() === "reject");
      ok("cmp-button: backdrop gone", s.veil === "removed");
      ok("cmp-button: page scrolls again", s.bodyOverflow !== "hidden" && s.canScroll);
      ok("cmp-button: blur removed from wrapper", !/blur/.test(s.appFilter || ""));
      await ctx.close();
    },
    "/cmp-nobutton": async () => {
      const { p, ctx } = await visit("/cmp-nobutton", 1200); let s = await state(p);
      ok("cmp-nobutton: banner cloaked immediately (visibility hidden)", s.notice !== "removed" && s.notice.visibility === "hidden");
      ok("cmp-nobutton: blur veil (backdrop-filter, no content) removed", s.veil === "none");
      ok("cmp-nobutton: scroll lock lifted (class + body position:fixed)", s.bodyOverflow !== "hidden" && s.bodyPos !== "fixed" && s.canScroll);
      ok("cmp-nobutton: inert removed from page wrapper", s.appInert === false);
      await p.waitForTimeout(4200); s = await state(p);
      ok("cmp-nobutton: after its click window the banner is display:none (per element)", s.notice.display === "none");
      await ctx.close();
    },
    "/generic-consent": async () => {
      const { p, ctx } = await visit("/generic-consent", 1500); const s = await state(p);
      ok("generic consent dialog (no CMP ids): Reject clicked by text, not Accept", s.clicks.join() === "reject" && s.canScroll);
      await ctx.close();
    },
    "/late-banner": async () => {
      const { p, ctx } = await visit("/late-banner", 8500); const s = await state(p);
      ok("late banner (6 s): still clicked, veil gone, page scrolls", s.clicks.join() === "reject" && s.veil === "removed" && s.canScroll);
      await ctx.close();
    },
    "/control-modal": async () => {
      const { p, ctx } = await visit("/control-modal", 5000); const s = await state(p);
      ok("control-modal: no banner seen, nothing clicked", !s.seen && s.clicks.length === 0);
      ok("control-modal: Bootstrap backdrop + modal + scroll lock untouched", s.bd === "block" && s.modal === "block" && s.bodyOverflow === "hidden" && s.bodyClasses.includes("modal-open"));
      await ctx.close();
    },
    "/control-app": async () => {
      const { p, ctx } = await visit("/control-app", 5000); const s = await state(p);
      ok("control-app: full-screen app's overflow:hidden untouched", !s.seen && s.bodyOverflow === "hidden" && s.htmlOverflow === "hidden");
      await ctx.close();
    },
    "/control-invitations": async () => {
      const { p, ctx } = await visit("/control-invitations", 8000); const s = await state(p);
      ok(`control-invitations: NO Accept/Decline/Reject clicked (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/control-call": async () => {
      const { p, ctx } = await visit("/control-call", 8000); const s = await state(p);
      ok(`control-call: incoming-call dialog and OK/Cancel confirm untouched (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/control-oauth": async () => {
      const { p, ctx } = await visit("/control-oauth", 8000); const s = await state(p);
      ok(`control-oauth: consent-named OAuth form, "Allow" never clicked (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/control-tos": async () => {
      const { p, ctx } = await visit("/control-tos", 8000); const s = await state(p);
      ok(`control-tos: terms/privacy-update dialog NOT accepted for the user (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/oauth/authorize": async () => {
      const { p, ctx } = await visit("/oauth/authorize", 8000); const s = await state(p);
      ok(`red-team F1 /oauth/authorize: nothing clicked, nothing submitted (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/app-permissions": async () => {
      const { p, ctx } = await visit("/app-permissions", 8000); const s = await state(p);
      ok(`red-team F1 cookie-worded dialog with a form: submit never clicked (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/consent-dialog-no-cookies": async () => {
      const { p, ctx } = await visit("/consent-dialog-no-cookies", 8000); const s = await state(p);
      ok(`red-team F1 aria-label="Consent…" dialog without cookie text: untouched (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/banner-offsite-link": async () => {
      const { p, ctx } = await visit("/banner-offsite-link", 6000); const s = await state(p);
      ok(`cookie banner whose "Accept" is an off-site link: not followed (got: ${s.clicks.join() || "none"})`, s.clicks.length === 0);
      await ctx.close();
    },
    "/modal-after-consent": async () => {
      const { p, ctx } = await visit("/modal-after-consent", 10000); const s = await state(p);
      ok("modal-after-consent: consent rejected first", s.clicks.join() === "reject");
      ok("modal-after-consent: later modal keeps its backdrop and scroll lock", !s.seen && s.bd === "block" && s.bodyClasses.includes("modal-open") && s.bodyOverflow === "hidden");
      await ctx.close();
    },
  };
  await Promise.all(Object.values(runs).map((f) => f().catch((e) => ok("fixture crashed: " + e.message, false))));
} finally {
  await browser.close();
  server.close();
}
console.log(results.sort().join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
