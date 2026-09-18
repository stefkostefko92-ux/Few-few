// tools/a11y.mjs — автоматична проверка за достъпност (WCAG 2.1/2.2 AA, машинно проверимата част) върху
// генерирания dist/ в истински headless Chromium (CDP, нула зависимости). Не замества ръчен одит — покрива
// каквото машина може да съди: alt на изображения, достъпно име на контроли/бутони/линкове, title на
// iframe, един h1 и без прескачане на нива, lang, дублирани id, tabindex>0, <main>, контраст на текста
// (1.4.3: 4.5:1 / 3:1 за едър), размер на целите (2.5.8: 24×24 — предупреждение).
//
//   node tools/a11y.mjs                 # всички BG страници + EN/IT хъб → a11y/report.json; exit 1 при грешки
//   node tools/a11y.mjs /bg/ /en/       # само подадените пътища
//   node tools/a11y.mjs --report-only   # не пада (за преглед)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist } from "./lib/serve-dist.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "a11y", "report.json");
const CHROME = process.env.CHROME || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
const argv = process.argv.slice(2);
const reportOnly = argv.includes("--report-only");
const only = argv.filter((a) => a.startsWith("/"));
const WARN_RULES = new Set(["target-size"]);

if (!CHROME) { console.error("✗ Няма Chromium (CHROME=/път/до/chrome)."); process.exit(2); }
if (!existsSync(DIST)) { console.error("✗ Няма dist/ — първо node build.mjs"); process.exit(2); }

/** Всички HTML страници на един език (+ подадени) — пътищата като в sitemap-а. */
function pagesOf(lang) {
  const out = [];
  const walk = (dir, rel) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`); else if (e.name === "index.html") out.push(rel); } };
  walk(join(DIST, lang), `/${lang}/`);
  return out;
}

// Скриптът, който се изпълнява в страницата. Връща списък {rule, el, detail}.
const AUDIT = String.raw`(() => {
  const issues = [];
  const push = (rule, el, detail) => issues.push({ rule, el, detail });
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const cs = (el) => getComputedStyle(el);
  const hidden = (el) => !!el.closest("[aria-hidden=true],[hidden]") || cs(el).display === "none" || cs(el).visibility === "hidden";
  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  const name = (el) => {
    const al = el.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
    const lb = el.getAttribute("aria-labelledby"); if (lb) { const t = lb.split(/\s+/).map((id) => { const e = document.getElementById(id); return e ? txt(e) : ""; }).join(" ").trim(); if (t) return t; }
    if (el.matches("input,select,textarea")) {
      if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && txt(l)) return txt(l); }
      const p = el.closest("label"); if (p && txt(p)) return txt(p);
      return (el.getAttribute("title") || "").trim();
    }
    if (el.matches("img")) return el.getAttribute("alt") || "";
    const t = txt(el); if (t) return t;
    const inner = el.querySelector("img[alt],[aria-label],svg[aria-label],svg title");
    if (inner) return (inner.getAttribute("alt") || inner.getAttribute("aria-label") || txt(inner) || "").trim();
    return (el.getAttribute("title") || "").trim();
  };
  if (!document.documentElement.lang) push("html-lang", "html", "missing lang");
  if (!document.querySelector("main")) push("landmark-main", "document", "no <main>");
  const h1 = document.querySelectorAll("h1").length; if (h1 !== 1) push("h1-count", "document", String(h1));
  document.querySelectorAll("img").forEach((i) => { if (!i.hasAttribute("alt")) push("img-alt", desc(i), i.getAttribute("src") || ""); });
  document.querySelectorAll("input:not([type=hidden]),select,textarea").forEach((c) => { if (hidden(c)) return; if (!name(c)) push("control-name", desc(c), c.name || c.type || ""); });
  document.querySelectorAll("button,a[href],[role=button],[role=link]").forEach((b) => { if (hidden(b)) return; if (!name(b)) push("button-name", desc(b), b.getAttribute("href") || ""); });
  document.querySelectorAll("iframe").forEach((f) => { if (hidden(f)) return; if (!f.getAttribute("title")) push("iframe-title", desc(f), f.getAttribute("src") || ""); });
  let prev = 0; document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => { if (hidden(h)) return; const l = +h.tagName[1]; if (prev && l > prev + 1) push("heading-skip", desc(h), "h" + prev + " → h" + l + ' "' + txt(h).slice(0, 40) + '"'); prev = l; });
  const ids = new Map(); document.querySelectorAll("[id]").forEach((e) => ids.set(e.id, (ids.get(e.id) || 0) + 1)); ids.forEach((n, id) => { if (n > 1) push("dup-id", "#" + id, String(n)); });
  document.querySelectorAll("[tabindex]").forEach((e) => { if (+e.getAttribute("tabindex") > 0) push("tabindex-positive", desc(e), e.getAttribute("tabindex")); });
  document.querySelectorAll("a[target=_blank]").forEach((a) => { const rel = (a.getAttribute("rel") || "").split(/\s+/); if (!rel.includes("noopener") && !rel.includes("noreferrer")) push("blank-noopener", desc(a), a.href); });
  // --- контраст (1.4.3). Прозрачни/градиентни фонове се пропускат (машината не може да съди честно).
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const blend = (fg, bg) => { const a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgOf = (el) => {
    let e = el, acc = null;
    while (e && e !== document.documentElement) {
      const s = cs(e); if (s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) { if (c[3] >= 1) return acc ? blend(acc, c) : c; acc = acc ? blend(acc, c) : c; }
      e = e.parentElement;
    }
    const root = parse(cs(document.body).backgroundColor); const rr = root && root[3] >= 1 ? root : parse(cs(document.documentElement).backgroundColor) || [255, 255, 255, 1];
    return acc ? blend(acc, rr) : rr;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set(); let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (t.length < 2) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest("script,style,noscript,option,template") || hidden(el)) continue;
    const s = cs(el); if (+s.opacity === 0 || +s.fontSize === 0) continue;
    const fg0 = parse(s.color); const bg = bgOf(el); if (!fg0 || !bg) continue;
    const fg = fg0[3] < 1 ? blend(fg0, bg) : fg0;
    const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const r = ratio(fg, bg), min = large ? 3 : 4.5;
    if (r < min - 0.005) push("contrast", desc(el), r.toFixed(2) + ":1 < " + min + " (" + Math.round(size) + "px) „" + t.slice(0, 40) + "“");
  }
  // --- размер на целите (2.5.8, AA в WCAG 2.2): 24×24 CSS px; изключение за линкове в текст.
  document.querySelectorAll("a[href],button").forEach((a) => { if (hidden(a) || a.closest("p,li,td,dd,figcaption,small")) return; const r = a.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) push("target-size", desc(a), Math.round(r.width) + "×" + Math.round(r.height) + " " + (a.getAttribute("href") || "").slice(0, 60)); });
  return issues;
})()`;

// Стабилен рендер: без анимации, reveal елементите видими, boot екранът скрит (иначе половината текст е opacity 0).
const FREEZE = `(() => { const s = document.createElement("style"); s.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}.boot{display:none!important}"; document.head.appendChild(s); return true; })()`;

async function withChrome(fn) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1366,900", `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs?.length) break; } catch { /* още не е готов */ } await sleep(250); }
    if (!tabs?.length) throw new Error("Chromium не отговори на CDP");
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text || "evaluate failed"); return r.result?.result?.value; };
    const open = async (url) => { await send("Page.navigate", { url }); await sleep(1800); await evaluate(FREEZE); await sleep(300); };
    try { await fn({ open, evaluate }); } finally { ws.close(); }
  } finally { ch.kill(); }
}

const { srv, base } = await serveDist(DIST);
const pages = only.length ? only : [...pagesOf("bg"), "/en/", "/it/"];
const report = { date: new Date().toISOString().slice(0, 10), viewport: "1366×900", rules: { errors: ["html-lang", "landmark-main", "h1-count", "img-alt", "control-name", "button-name", "iframe-title", "heading-skip", "dup-id", "tabindex-positive", "blank-noopener", "contrast"], warnings: [...WARN_RULES] }, pages: {} };
let errors = 0, warnings = 0;
try {
  await withChrome(async ({ open, evaluate }) => {
    for (const p of pages) {
      await open(base + p);
      const issues = await evaluate(AUDIT);
      const e = issues.filter((i) => !WARN_RULES.has(i.rule)), w = issues.filter((i) => WARN_RULES.has(i.rule));
      errors += e.length; warnings += w.length;
      report.pages[p] = { errors: e.length, warnings: w.length, issues };
      console.log(`${e.length ? "✗" : "✓"} ${p}  грешки ${e.length} · предупреждения ${w.length}`);
      for (const i of e) console.log(`    ${i.rule}  ${i.el}  ${i.detail}`);
    }
  });
} finally { srv.close(); }
report.summary = { pages: pages.length, errors, warnings };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(`\n${errors ? "✗" : "✓"} a11y: ${pages.length} страници · ${errors} грешки · ${warnings} предупреждения → ${OUT.replace(ROOT, "")}`);
if (errors && !reportOnly) process.exit(1);
