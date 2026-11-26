// design-lint.test.mjs — статичният под на дизайна (идеята е от Nutlope/hallmark, кодът е наш).
//
// Всяко правило има положителен и отрицателен случай: линтер, който вика за всичко, се изключва
// за седмица. Затова „шрифт от Google през next/font“ (самохостван при билда), `:focus:not(:focus-visible)`
// и `alt=""` за декоративна картинка НЕ са находки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintText, RULES } from "./design-lint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ids = (text, file = "x.html") => lintText(text, file).map((f) => f.rule);

test("чужд шрифт от CDN е HIGH; next/font/google (самохостван) и локален @font-face не са", () => {
  assert.deepEqual(ids('<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">'), ["external-font"]);
  assert.deepEqual(ids("@import url('https://fonts.bunny.net/css?family=lato');", "a.css"), ["external-font"]);
  assert.deepEqual(ids('<link href="https://api.fontshare.com/v2/css?f[]=satoshi" rel="stylesheet">'), ["external-font"]);
  assert.deepEqual(ids('import { Inter } from "next/font/google";', "layout.tsx"), []);
  assert.deepEqual(ids("@font-face { font-family: X; src: url('/fonts/x.woff2'); }", "a.css"), []);
  assert.equal(RULES["external-font"].sev, "HIGH");
});

test("скрипт или стил от публичен CDN е HIGH; собственият е наред", () => {
  assert.deepEqual(ids('<script src="https://cdn.jsdelivr.net/npm/three@0.160/build/three.min.js"></script>'), ["cdn-asset"]);
  assert.deepEqual(ids('<link rel="stylesheet" href="https://unpkg.com/aos@2/dist/aos.css">'), ["cdn-asset"]);
  assert.deepEqual(ids('<script src="/js/three.module.js"></script>'), []);
});

test("картинка, закачена от чужд сайт (Wikimedia, Unsplash, placeholder), е HIGH", () => {
  assert.deepEqual(ids('<img alt="x" src="https://upload.wikimedia.org/a.jpg">'), ["hotlink-image"]);
  assert.deepEqual(ids(".hero{background:url(https://images.unsplash.com/photo-1)}", "a.css"), ["hotlink-image"]);
  assert.deepEqual(ids('<img alt="x" src="https://picsum.photos/200">'), ["hotlink-image"]);
  assert.deepEqual(ids('<img alt="x" src="/img/hero.avif">'), []);
});

test("outline: none без :focus-visible е HIGH; със :focus-visible или :focus:not(:focus-visible) не е", () => {
  assert.deepEqual(ids("button:focus{outline:none}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("a{outline: 0}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("button:focus{outline:none} button:focus-visible{outline:2px solid}", "a.css"), []);
  assert.deepEqual(ids("button:focus:not(:focus-visible){outline:none}", "a.css"), []);
  assert.deepEqual(ids('<button className="outline-none focus-visible:ring-2">', "b.tsx"), [], "Tailwind с focus-visible");
  assert.deepEqual(ids('<button className="outline-none">', "b.tsx"), ["focus-hidden"]);
});

test("забранен зум (user-scalable=no, maximum-scale=1) е HIGH — WCAG 1.4.4", () => {
  assert.deepEqual(ids('<meta name="viewport" content="width=device-width, user-scalable=no">'), ["zoom-blocked"]);
  assert.deepEqual(ids('<meta name="viewport" content="width=device-width, maximum-scale=1">'), ["zoom-blocked"]);
  assert.deepEqual(ids('<meta name="viewport" content="width=device-width, initial-scale=1">'), []);
  assert.deepEqual(ids('<meta name="viewport" content="width=device-width, maximum-scale=5">'), []);
});

test("img без alt е HIGH; alt=\"\" (декоративна) и next/image с alt са наред", () => {
  assert.deepEqual(ids('<img src="/a.png">'), ["img-no-alt"]);
  assert.deepEqual(ids('<img src="/a.png" alt="">'), []);
  assert.deepEqual(ids('<Image src={hero} alt="Залата" />', "p.tsx"), []);
  assert.deepEqual(ids('<Image src={hero} width={4} />', "p.tsx"), ["img-no-alt"]);
  assert.deepEqual(ids('<img\n  src="/a.png"\n  alt="ред по-долу"\n>'), [], "alt на следващ ред в същия таг");
});

test("текст-пълнеж (lorem ipsum, [ЗА ПОПЪЛВАНЕ]) е HIGH — без измислено съдържание", () => {
  assert.deepEqual(ids("<p>Lorem ipsum dolor sit amet</p>"), ["placeholder-copy"]);
  assert.deepEqual(ids("<p>Срок: [ЗА ПОПЪЛВАНЕ от собственика]</p>"), ["placeholder-copy"]);
  assert.deepEqual(ids("<p>Работно време: 9–18 ч.</p>"), []);
});

test("твърдение, което иска доказателство, е MEDIUM (към marketing-claims-review); нов SVG е INFO", () => {
  assert.deepEqual(ids("<h2>Над 10 000 доволни клиенти</h2>"), ["claim-needs-proof"]);
  assert.deepEqual(ids("<p>Il migliore servizio di Milano</p>"), ["claim-needs-proof"]);
  assert.deepEqual(ids("<p>The #1 platform for teams</p>"), ["claim-needs-proof"]);
  assert.deepEqual(ids("<p>Свържете се с нас</p>"), []);
  assert.equal(RULES["claim-needs-proof"].sev, "MEDIUM");
  assert.deepEqual(ids('<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>'), ["svg"]);
  assert.equal(RULES.svg.sev, "INFO");
});

test("design-lint-disable-line <правило> заглушава точно това правило на точно този ред", () => {
  assert.deepEqual(ids('<img src="/a.png"> <!-- design-lint-disable-line img-no-alt -->'), []);
  assert.deepEqual(ids('<img src="/a.png"> <!-- design-lint-disable-line svg -->'), ["img-no-alt"]);
});

test("находката носи ред и колона", () => {
  const [f] = lintText('<p>ok</p>\n<img src="/a.png">', "x.html");
  assert.equal(f.line, 2);
  assert.equal(f.rule, "img-no-alt");
});

test("CLI: обхожда папка, прескача node_modules и тестове, изход 1 при HIGH, 0 без HIGH", () => {
  const t = mkdtempSync(join(tmpdir(), "dl-"));
  try {
    mkdirSync(join(t, "site", "node_modules", "x"), { recursive: true });
    mkdirSync(join(t, "site", "src"), { recursive: true });
    writeFileSync(join(t, "site", "node_modules", "x", "a.html"), '<img src="/a.png">');
    writeFileSync(join(t, "site", "src", "a.test.tsx"), '<img src="/a.png">');
    writeFileSync(join(t, "site", "src", "ok.html"), '<p>Свържете се с нас</p><svg></svg>');
    let r = spawnSync(process.execPath, [join(here, "design-lint.mjs"), join(t, "site"), "--json"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.deepEqual(j.findings.map((f) => f.rule), ["svg"]);
    writeFileSync(join(t, "site", "src", "bad.html"), '<img src="/a.png">');
    r = spawnSync(process.execPath, [join(here, "design-lint.mjs"), join(t, "site")], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /bad\.html:1/);
    r = spawnSync(process.execPath, [join(here, "design-lint.mjs")], { encoding: "utf8" });
    assert.equal(r.status, 2, "без папка — употреба");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

// Базова линия по 26-те продукта (26.11): тези бяха фалшиви тревоги — заковани, за да не се върнат.
test("споменаване в коментар (JS, CSS, HTML, EJS) не е находка; URL с // в атрибут остава", () => {
  assert.deepEqual(ids("/**\n * Two stacked <img> layers cross-fade\n */", "a.tsx"), []);
  assert.deepEqual(ids("// satori рендира <img>, не next/image", "a.tsx"), []);
  assert.deepEqual(ids("<%# валиден <img> и без скрипт %>", "a.ejs"), []);
  assert.deepEqual(ids("<!-- <img src=x> -->", "a.html"), []);
  assert.deepEqual(ids("/* fonts.googleapis.com е забранен */", "a.css"), []);
  assert.deepEqual(ids('<img alt="x" src="https://upload.wikimedia.org/a.jpg"> // бележка', "a.tsx"), ["hotlink-image"]);
});

test("скрит outline с видим заместител или върху програмно фокусиран контейнер не е находка", () => {
  assert.deepEqual(ids('<input className="outline-none focus:ring-2 focus:ring-blue-500">', "a.tsx"), []);
  assert.deepEqual(ids('<input className="outline-none focus:border-slate-900">', "a.tsx"), []);
  assert.deepEqual(ids('<div role="dialog" tabIndex={-1} className="focus:outline-none">', "a.tsx"), []);
  assert.deepEqual(ids("input:focus{outline:none;box-shadow:0 0 0 3px #036}", "a.css"), []);
  assert.deepEqual(ids("input:focus{outline:none;border-color:#036}", "a.css"), []);
  assert.deepEqual(ids("input:focus{outline:none;color:red}", "a.css"), ["focus-hidden"], "смяна само на цвета на текста не стига");
});

test("EJS вътре в таг (<%- … %>) не реже тага преди alt", () => {
  assert.deepEqual(ids(`<img class="still" src="<%= a %>" <%- first ? 'srcset="x"' : '' %> alt="" decoding="async">`, "a.ejs"), []);
  assert.deepEqual(ids(`<img src="<%= a %>" <%- x %> decoding="async">`, "a.ejs"), ["img-no-alt"]);
});

test("SVG се отчита веднъж на файл с броя (генериран сайт не дава хиляди редове)", () => {
  const f = lintText("<svg></svg>\n<svg></svg>\n<svg></svg>", "a.html").filter((x) => x.rule === "svg");
  assert.equal(f.length, 1);
  assert.match(f[0].snippet, /×3/);
});

// Преглед на PR #494 (Кодаджията + Дизайнера).
test("ресет без фокус (`input{border:none;outline:none}`) е находка; заместителят важи само в :focus блок", () => {
  assert.deepEqual(ids("input{border:none;outline:none}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("input:focus{outline:none;border:none}", "a.css"), ["focus-hidden"], "border:none не е заместител");
  assert.deepEqual(ids("input:focus{outline:none;background:transparent}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("input:focus{outline:none;border:2px solid #036}", "a.css"), []);
});

test(":focus-visible освобождава само ако наистина рисува фокус; Tailwind се съди по класа, не по файла", () => {
  assert.deepEqual(ids("a:focus{outline:none} .x:focus-visible{color:red}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("a:focus{outline:none} a:focus-visible{outline:2px solid}", "a.css"), []);
  assert.deepEqual(ids('<a className="focus-visible:ring-2">x</a><input className="outline-none">', "a.tsx"), ["focus-hidden"]);
});

test("протоколно-относителни адреси и viewport в Next (export const viewport) се хващат", () => {
  assert.deepEqual(ids('<link href="//fonts.googleapis.com/css2?family=Inter" rel="stylesheet">'), ["external-font"]);
  assert.deepEqual(ids('<script src="//cdn.jsdelivr.net/npm/x"></script>'), ["cdn-asset"]);
  assert.deepEqual(ids("export const viewport = { width: 'device-width', maximumScale: 1, userScalable: false };", "layout.ts"), ["zoom-blocked"]);
  assert.deepEqual(ids("export const viewport = { width: 'device-width', initialScale: 1 };", "layout.tsx"), []);
});

test("[todo] в код не е пълнеж; [TODO] в текста е; <Image {...props} /> не е без alt", () => {
  assert.deepEqual(ids("const xs = [todoItem, other];", "a.tsx"), []);
  assert.deepEqual(ids("<p>[TODO] текст</p>"), ["placeholder-copy"]);
  assert.deepEqual(ids("<Image {...props} />", "a.tsx"), []);
});

test("липсващ път е грешка (изход 2), не тихо „0 находки“", () => {
  const r = spawnSync(process.execPath, [join(here, "design-lint.mjs"), "/няма/такава/папка"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /няма такъв път/);
});

test("хиляди находки в един файл не са квадратични (под 2 s)", () => {
  const big = '<img src="/a.png">\n'.repeat(20000);
  const t0 = Date.now();
  assert.equal(lintText(big, "a.html").length, 20000);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
});

// Повторен преглед на PR #494 (Кодаджията + Дизайнера).
test("url(//хост) в .scss/.tsx не е коментар — забраненият хост се хваща", () => {
  assert.deepEqual(ids("@import url(//fonts.googleapis.com/css2?family=Inter);", "a.scss"), ["external-font"]);
  assert.deepEqual(ids('<div style={{ backgroundImage: "url(//images.unsplash.com/x.jpg)" }} />', "a.tsx"), ["hotlink-image"]);
  assert.deepEqual(ids("const a = 1; // fonts.googleapis.com", "a.tsx"), [], "истински коментар остава маскиран");
});

test("data-alt не е alt; outline-offset не рисува фокус", () => {
  assert.deepEqual(ids('<img data-alt="x" src="/a.png">'), ["img-no-alt"]);
  assert.deepEqual(ids("a:focus{outline:none} a:focus-visible{outline-offset:2px}", "a.css"), ["focus-hidden"]);
});

test(":focus-visible освобождава само същия селектор, не целия файл", () => {
  assert.deepEqual(ids("a:focus{outline:none} a:focus-visible{outline:2px solid} input:focus{outline:none}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids(".btn:focus{outline:none}\n.btn:focus-visible{box-shadow:0 0 0 3px #036}", "a.css"), []);
});

test("Tailwind: само focus-visible:ring/outline/border/shadow е заместител, не focus-visible:bg-…", () => {
  assert.deepEqual(ids('<input className="outline-none focus-visible:bg-slate-50">', "a.tsx"), ["focus-hidden"]);
  assert.deepEqual(ids('<input className="outline-none focus-visible:ring-2">', "a.tsx"), []);
});

// Базова линия след повторния преглед: глобалното `input:focus-visible{outline:3px}` побеждава класовия
// ресет `.login-input{outline:none}` по специфичност — не е находка; `.x:focus{outline:none}` обаче го бие.
// Четвърти преглед на PR #494 (Кодаджията): статичната проверка не може да реши каскадата (специфичност,
// ред, кои елементи носят класа). Затова ресетът се освобождава САМО от :focus-visible за същия селектор —
// той е с по-висока специфичност и бие ресета при всякакъв ред. Всичко друго е находка; ако е нарочно —
// `design-lint-disable-line focus-hidden` с причина.
test("ресет се освобождава само от :focus-visible за същия селектор; глобални и елементни правила не стигат", () => {
  const fv = "a:focus-visible,\ninput:focus-visible,\n[tabindex]:focus-visible { outline: 3px solid gold; outline-offset: 2px; }";
  assert.deepEqual(ids(`.login-input{outline:none}\n${fv}`, "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids(".login-input{outline:none}\n.login-input:focus-visible{outline:3px solid gold}", "a.css"), []);
  assert.deepEqual(ids("a:focus-visible{outline:2px solid}\n.card-input{outline:none}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids("input:focus-visible{outline:2px solid}\ninput.search{outline:none}", "a.css"), ["focus-hidden"], "редът решава — не се гадае");
  assert.deepEqual(ids("[tabindex]:focus-visible{outline:2px solid}\n.card-input{outline:none}", "a.css"), ["focus-hidden"]);
  assert.deepEqual(ids(":focus-visible{outline:2px solid}\n.card-input{outline:none}", "a.css"), ["focus-hidden"], "(0,1,0) като клас — по-късният ресет печели");
  assert.deepEqual(ids(".skip:focus{top:0}\nmain:focus{outline:none}", "a.css"), [], "main — цел на skip link, фокусът е програмен");
  assert.deepEqual(ids(".x{outline:none} /* design-lint-disable-line focus-hidden — фокусът е на родителя */", "a.css"), []);
});

test(":focus-visible за същия селектор от друг CSS файл на продукта важи", () => {
  const t = mkdtempSync(join(tmpdir(), "dl-"));
  try {
    writeFileSync(join(t, "base.css"), ".nav-link:focus-visible, button:focus-visible { outline: 3px solid #036; }");
    writeFileSync(join(t, "nav.css"), ".nav-link { outline: none; }\n.menu button:focus { outline: none; }");
    const r = spawnSync(process.execPath, [join(here, "design-lint.mjs"), t, "--json"], { encoding: "utf8" });
    const j = JSON.parse(r.stdout);
    assert.deepEqual(j.findings.map((f) => `${f.rule}:${f.line}`), ["focus-hidden:2"]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("outline: 0.2rem не е скрит фокус", () => {
  assert.deepEqual(ids("a:focus-visible{outline:0.125rem solid #036}", "a.css"), []);
  assert.deepEqual(ids("a{outline:0.2rem solid #036}", "a.css"), []);
  assert.deepEqual(ids("a{outline:0}", "a.css"), ["focus-hidden"]);
});

test("прескочен файл (над 2 MB) се брои и се казва; нечетим — изход 2", () => {
  const t = mkdtempSync(join(tmpdir(), "dl-"));
  try {
    writeFileSync(join(t, "big.html"), "<p>x</p>".repeat(300000));
    writeFileSync(join(t, "ok.html"), "<p>ok</p>");
    const r = spawnSync(process.execPath, [join(here, "design-lint.mjs"), t, "--json"], { encoding: "utf8" });
    const j = JSON.parse(r.stdout);
    assert.equal(j.skipped.length, 1);
    assert.match(j.skipped[0].why, /2 MB/);
    const r2 = spawnSync(process.execPath, [join(here, "design-lint.mjs"), t], { encoding: "utf8" });
    assert.match(r2.stdout, /прескочени: 1/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("Tailwind focus:ring-0 / border-0 / shadow-none не са заместител", () => {
  assert.deepEqual(ids('<input className="outline-none focus:ring-0">', "a.tsx"), ["focus-hidden"]);
  assert.deepEqual(ids('<input className="outline-none focus:border-0">', "a.tsx"), ["focus-hidden"]);
  assert.deepEqual(ids('<input className="outline-none focus:shadow-none">', "a.tsx"), ["focus-hidden"]);
  assert.deepEqual(ids('<input className="outline-none focus:ring-2 focus:ring-blue-500">', "a.tsx"), []);
});

test("вложен блок (@media, SCSS) се чете по вътрешната скоба; style={{outline:\"none\"}} се хваща", () => {
  assert.deepEqual(ids("@media (min-width:1px){.a:focus{outline:none;box-shadow:0 0 0 3px #036}}", "a.css"), []);
  assert.deepEqual(ids('<input style={{ outline: "none" }} />', "a.tsx"), ["focus-hidden"]);
});
