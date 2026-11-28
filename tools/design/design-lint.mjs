#!/usr/bin/env node
// tools/design/design-lint.mjs — статичният под на дизайна: това, което прави страница „генерирана“,
// неудобна или незаконна, без да я рендерира.
//
// Идеята („под“ от твърди правила + статична проверка) е от Nutlope/hallmark (MIT); кодът и правилата
// са наши. Обратното на тяхното подразбиране: НИКАКВИ шрифтове, скриптове и картинки от чужди сървъри —
// всяка такава заявка праща IP адреса на посетителя на трета страна без съгласие (GDPR).
//
// Употреба:
//   node tools/design/design-lint.mjs <папка|файл> [--json]
//
// Изход: 0 — няма HIGH · 1 — има HIGH · 2 — употреба. Движението (reduced-motion, строб) е в
// motion-a11y.mjs — тук не се дублира. Заглушаване на един ред: `design-lint-disable-line <правило> — <причина>`.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename, relative } from "node:path";
import { isMain } from "../lib/is-main.mjs";

export const RULES = {
  "external-font": { sev: "HIGH", why: "шрифт от чужд сървър — IP на посетителя към трета страна; хоствай го при нас (или next/font)" },
  "cdn-asset": { sev: "HIGH", why: "скрипт/стил от публичен CDN — поверителност и верига на доставка; вгради го в бъндъла" },
  "hotlink-image": { sev: "HIGH", why: "картинка, закачена от чужд сайт — изтегли я с лиценза ѝ и я хоствай при нас" },
  "focus-hidden": { sev: "HIGH", why: "фокусът е скрит без :focus-visible — клавиатурата губи посоката (WCAG 2.4.7)" },
  "zoom-blocked": { sev: "HIGH", why: "забранен зум — WCAG 1.4.4; махни user-scalable=no/maximum-scale<2" },
  "img-no-alt": { sev: "HIGH", why: "картинка без alt — WCAG 1.1.1; декоративна → alt=\"\"" },
  "placeholder-copy": { sev: "HIGH", why: "текст-пълнеж — без измислено съдържание; попълни истинското или махни блока" },
  "claim-needs-proof": { sev: "MEDIUM", why: "твърдение, което иска доказателство — умение marketing-claims-review" },
  svg: { sev: "MEDIUM", why: "SVG — правилото на собственика „никога SVG“: смени го (3D, <canvas>, растер); от 2026-11-27 и наличният" },
};

const FONT_HOSTS = /(?:https?:)?\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|api\.fontshare\.com|cdn\.fontshare\.com|use\.typekit\.net|p\.typekit\.net|fonts\.bunny\.net|fast\.fonts\.net|use\.fontawesome\.com|kit\.fontawesome\.com)/i;
const CDN_HOSTS = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'](?:https?:)?\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|cdn\.tailwindcss\.com|ajax\.googleapis\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|esm\.sh|cdn\.skypack\.dev)/i;
const IMG_HOSTS = /(?:https?:)?\/\/(?:upload\.wikimedia\.org|images\.unsplash\.com|source\.unsplash\.com|plus\.unsplash\.com|picsum\.photos|placehold\.co|placehold\.it|via\.placeholder\.com|dummyimage\.com|i\.imgur\.com|images\.pexels\.com|loremflickr\.com)/i;
// `\b` в JS не разпознава кирилица — границите са по Unicode букви (флаг u).
const B = "(?<![\\p{L}\\p{N}_])", E = "(?![\\p{L}\\p{N}_])";
const W = (src) => new RegExp(src.replaceAll("\\b<", B).replaceAll("\\b>", E), "iu");
const PLACEHOLDER = W("\\b<lorem ipsum\\b>|\\b<dolor sit amet\\b>");
// Скобите — само с главни букви: `[todoItem]` в код не е пълнеж, `[TODO]` в текста е.
const PLACEHOLDER_TAG = /\[(?:ЗА ПОПЪЛВАНЕ|TODO|TBD|DA COMPLETARE)(?![\p{L}\p{N}_])[^\]\n]*\]/u;
const CLAIMS = [
  W("\\b<\\d[\\d\\s.,]{0,15}\\+?\\s*(?:доволни\\s+)?(?:клиенти|потребители|customers|users|clienti|utenti)\\b>"),
  W("(?:^|[\\s>„\"(])(?:#\\s?1|№\\s?1)(?=[\\s<,.!”\")]|$)"),
  W("\\b<(?:най-добрият|най-добрата|най-доброто|the best|il migliore|la migliore|i migliori)\\b>"),
  W("\\b<(?:гарантира(?:н|на|но|ме)?|guaranteed|garantit[oa])\\b>"),
  W("\\b<100\\s?%\\s*(?:сигурн|безопасн|secure|safe|sicur)"),
];

const TEXT_EXT = new Set([".html", ".htm", ".ejs", ".css", ".scss", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".mdx"]);
const MARKUP_EXT = new Set([".html", ".htm", ".ejs", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
// Чист код (без разметка): само `export const viewport` на Next — шрифтове/CDN там са CSP списъци, не заявки.
const CODE_EXT = new Set([".ts", ".js"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "out", ".turbo", ".tmp", "vendor"]);
const isTestFile = (name) => /\.(?:test|spec)\.[a-z]+$/i.test(name) || name === "__tests__";

/** Началата на редовете — ред по индекс с двоично търсене (хиляди находки не стават квадратични). */
function lineIndex(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return { line: lo + 1, col: idx - starts[lo] + 1 }; };
}

/** Коментарите стават интервали (новите редове остават) — споменат `<img>` или забранен хост в коментар
 *  не е находка, а редовете и колоните не мърдат. `//` се маха само след интервал/разделител — `https://`
 *  в атрибут и `url(//хост)` остават. */
export function maskComments(text, ext) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  // Низовете в кавички (на един ред) се прескачат: `accept="image/*"` или "src/**/*.ts" не отварят коментар,
  // който да скрие всичко до следващото `*/` (шести преглед на PR #494). Кавичка без двойка на реда не е низ;
  // апостроф в текст може само да остави коментар немаскиран — повече находки, никога по-малко.
  // Шаблонен низ (`…`) на един ред — също (седми преглед).
  const parts = [String.raw`"(?:\\.|[^"\\\n])*"`, String.raw`'(?:\\.|[^'\\\n])*'`, String.raw`\x60(?:\\.|[^\x60\\\n])*\x60`, String.raw`\/\*[\s\S]*?\*\/`];
  if ([".jsx", ".tsx", ".vue", ".svelte", ".astro", ".scss", ".mdx"].includes(ext)) parts.push(String.raw`(?<=^|[\s;{},])\/\/[^\n]*`);
  const re = new RegExp(parts.join("|"), "g");
  const mask = (src) => src.replace(re, (m) => (m[0] === '"' || m[0] === "'" || m[0] === "\x60" ? m : blank(m)));
  // В HTML/EJS `/* */` е коментар само в <style>/<script>; в текста `image/*` е просто текст.
  let t = [".html", ".htm", ".ejs"].includes(ext)
    ? text.replace(/(<(style|script)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (m, open, tag, body, close) => open + mask(body) + close)
    : mask(text);
  if (ext !== ".css" && ext !== ".scss") t = t.replace(/<!--[\s\S]*?-->/g, blank);
  if (ext === ".ejs") t = t.replace(/<%#[\s\S]*?%>/g, blank);
  return t;
}

// Видим заместител на outline в същия CSS блок или в същия клас-низ (Tailwind); или контейнер, на който
// фокусът се дава от кода (tabIndex -1, role=dialog) — той не е в реда на Tab.
// Заместителят важи само в :focus блок и само с видима стойност (border:none, transparent — не).
// `border-*` — само страните и цвят/дебелина: border-radius/-collapse/-spacing не рисуват (пети преглед на PR #494).
const BORDER_DRAWS = "border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-(?:color|width))?";
const CSS_ALT = new RegExp(String.raw`(?:^|[;{\s])(?:box-shadow|${BORDER_DRAWS}|background(?:-color)?|text-decoration(?:-line)?)\s*:(?!\s*(?:none\b|0\s*(?:[;}]|$)|inherit\b|initial\b|unset\b))(?![^;}]*\btransparent\b)[^;}]+`, "i");
// Правило :focus-visible, което наистина рисува фокус (outline/box-shadow/border с видима стойност).
// (outline-offset/outline-color сами не рисуват нищо.)
const DRAWS = new RegExp(String.raw`(?:^|[;{\s])(?:outline|outline-style|box-shadow|${BORDER_DRAWS})\s*:(?!\s*(?:none\b|0\s*(?:[;}]|$)))(?![^;}]*\btransparent\b)[^;}]+`, "i");
const normSel = (x) => x.replace(/\s+/g, " ").trim();
/** Базовите селектори, за които има :focus-visible правило, което рисува фокус (`a:focus-visible` → `a`). */
function focusVisibleBases(text) {
  const bases = new Set();
  if (!text.includes(":focus-visible")) return bases;
  // Линейно по `{` — регекс `([^{}]+)\{` върху дълъг текст без скоби е квадратичен.
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    const sel = text.slice(Math.max(text.lastIndexOf("}", i), text.lastIndexOf("{", i - 1)) + 1, i);
    if (!sel.includes(":focus-visible")) continue;
    const end = text.indexOf("}", i);
    if (!DRAWS.test(text.slice(i + 1, end === -1 ? undefined : end))) continue;
    for (const piece of sel.split(",")) if (piece.includes(":focus-visible")) bases.add(normSel(piece.replace(/:focus-visible/g, "")));
  }
  return bases;
}
// Само класове, които рисуват рамка/линия — `focus-visible:bg-…` не е фокус индикатор.
// `ring-0`, `border-0`, `shadow-none`, `outline-none` не рисуват нищо; `ring-<цвят>`, `ring-offset-*` и
// `outline-offset-*` сами — също (шести преглед на PR #494). Рисува голото `ring`/`outline`, ширина или [произволна].
const TW_ALT = /\b(?:focus|focus-visible|focus-within):(?:ring(?:-(?:[1-8]\b|\[)|\b(?!-))|border-(?!0\b|none\b|transparent\b|spacing|collapse|separate)|border\b(?!-)|shadow-(?!none\b)|shadow\b(?!-)|underline\b|outline(?:-(?:[1-8]\b|\[|solid\b|dashed\b|dotted\b|double\b)|\b(?!-)))/;
const PROG_FOCUS = /tabIndex=\{?-1\}?|tabindex=["']-1["']|role=["'](?:dialog|alertdialog|region|log)["']/i;

const CLASS_CALL = /(?:\b(?:cn|clsx|classnames|classNames|cva|twMerge|tv)\s*\(|\b(?:className|class)\s*=\s*\{)/g;
/** Целият израз cn(…)/className={…}, който съдържа позиция `at`, или null. Скобите се броят (без низовете). */
function classExpr(text, at) {
  let best = null;
  const from = Math.max(0, at - 2000);
  CLASS_CALL.lastIndex = from;
  for (let m; (m = CLASS_CALL.exec(text)) && m.index < at;) {
    const open = m.index + m[0].length - 1, pair = text[open] === "(" ? ")" : "}";
    let depth = 0, q = null, end = -1;
    for (let i = open; i < text.length && i < open + 4000; i++) {
      const ch = text[i];
      if (q) { if (ch === q && text[i - 1] !== "\\") q = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") q = ch;
      else if (ch === text[open]) depth++;
      else if (ch === pair && --depth === 0) { end = i; break; }
    }
    if (end > at) best = text.slice(open, end + 1); // най-вътрешният, който я съдържа
  }
  return best;
}

/** Всички находки в един текст. `file` решава типа (css/markup) по разширението. */
export function lintText(raw, file, opts = {}) {
  const ext = extname(file).toLowerCase();
  const lines = raw.split("\n");
  const text = maskComments(raw, ext);
  const out = [];
  const seen = new Set();
  const pos = lineIndex(text);
  const add = (rule, idx, snippet) => {
    const { line, col } = pos(idx);
    const key = `${rule}:${line}`;
    if (seen.has(key)) return;
    const src = lines[line - 1] || "";
    // Заглушава само с причина (поне една дума след правилото): `design-lint-disable-line focus-hidden — фокусът е на родителя`.
    if (src.includes("design-lint-disable-line") && new RegExp(`design-lint-disable-line[^\\n]*?(?<![\\w-])${rule}(?![\\w-])[^\\n*>]*?\\p{L}{3}`, "u").test(src)) return;
    seen.add(key);
    out.push({ rule, sev: RULES[rule].sev, line, col, snippet: snippet.trim().slice(0, 120), why: RULES[rule].why });
  };
  const each = (re, fn) => { const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); let m; while ((m = g.exec(text))) { fn(m); if (m[0] === "") g.lastIndex++; } };

  // Next: `export const viewport = { maximumScale: 1, userScalable: false }` (и в .ts, и в .tsx).
  each(/\bviewport\s*(?::\s*[A-Za-z]+\s*)?=\s*\{[^}]*\}/, (m) => {
    const max = m[0].match(/maximumScale\s*:\s*([\d.]+)/);
    if (/userScalable\s*:\s*false\b/.test(m[0]) || (max && Number(max[1]) < 2)) add("zoom-blocked", m.index, m[0]);
  });
  if (CODE_EXT.has(ext)) return out.sort((a, b) => a.line - b.line || a.col - b.col);

  each(FONT_HOSTS, (m) => add("external-font", m.index, m[0]));
  each(CDN_HOSTS, (m) => add("cdn-asset", m.index, m[0]));
  each(IMG_HOSTS, (m) => add("hotlink-image", m.index, m[0]));

  // Фокус в CSS: outline none/0 е наред в `:focus:not(:focus-visible)`, в :focus блок с видим заместител,
  // или ако файлът има :focus-visible правило, което наистина рисува фокус.
  // + глобалните от другите CSS файлове на продукта (lintPath): каскадата е обща за сайта.
  const fvBases = new Set([...focusVisibleBases(text), ...(opts.globalFv || [])]);
  // `0` само самостоятелно: `outline: 0.2rem solid` рисува фокус.
  each(/outline\s*:\s*["']?(?:none\b|0(?![.\d\w-]))/i, (m) => {
    const start = text.lastIndexOf("}", m.index) + 1;
    const end = text.indexOf("}", m.index);
    const block = text.slice(start, end === -1 ? undefined : end);
    const brace = block.lastIndexOf("{"); // вътрешната скоба — @media/SCSS обвивката е отвън
    const sel = brace === -1 ? "" : block.slice(block.lastIndexOf("{", brace - 1) + 1, brace); // без `@media (…){`
    const decl = brace === -1 ? block : block.slice(brace + 1);
    if (/:focus:not\(:focus-visible\)/.test(sel)) return;
    if (/:focus(?:-within)?\b/.test(sel) && CSS_ALT.test(decl)) return;
    // Освобождава САМО :focus-visible правило за същия селектор (`.btn` / `.btn:focus` ↔ `.btn:focus-visible`):
    // то е с по-висока специфичност и бие ресета при всякакъв ред. Глобални и елементни правила (`*`, голо
    // `:focus-visible`, `input:focus-visible`) не стигат — статичната проверка не знае реда, специфичността
    // спрямо класа и кои елементи носят класа (четвърти преглед на PR #494). Нарочно → disable-line с причина.
    // `main` е цел на skip link — фокусът му е програмен.
    const pieces = sel.split(",").map((x) => normSel(x.replace(/:focus(?:-within)?(?!-)/g, ""))).filter(Boolean);
    if (pieces.length && pieces.every((x) => fvBases.has(x) || x === "main")) return;
    add("focus-hidden", m.index, m[0]);
  });
  // Tailwind `outline-none` — съди се по собствения клас-низ, не по файла. Ако низът е аргумент на
  // cn()/clsx()/cva()/twMerge() или в className={…}, съди се целият израз (shadcn шаблонът).
  if (MARKUP_EXT.has(ext)) each(/\boutline-none\b/, (m) => {
    const q1 = Math.max(text.lastIndexOf('"', m.index), text.lastIndexOf("'", m.index), text.lastIndexOf("`", m.index));
    const cls = classExpr(text, m.index) ?? text.slice(q1, text.indexOf(text[q1] || '"', m.index));
    const tag = text.slice(text.lastIndexOf("<", m.index), m.index + 400);
    if (TW_ALT.test(cls) || PROG_FOCUS.test(tag.slice(0, tag.indexOf(">") + 1 || undefined))) return;
    add("focus-hidden", m.index, m[0]);
  });

  each(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i, (m) => {
    const c = m[0];
    const max = c.match(/maximum-scale\s*=\s*([\d.]+)/i);
    if (/user-scalable\s*=\s*(?:no|0)\b/i.test(c) || (max && Number(max[1]) < 2)) add("zoom-blocked", m.index, c);
  });

  if (MARKUP_EXT.has(ext)) {
    each(/<(img|Image)\b(?:<%[\s\S]*?%>|[^>"'{<]|"[^"]*"|'[^']*'|\{[^}]*\})*>/g, (m) => {
      // `{...props}` може да носи alt — не се гадае.
      if (!/(?<![\w-])alt\s*=/.test(m[0]) && !/\{\s*\.\.\./.test(m[0])) add("img-no-alt", m.index, m[0]);
    });
    const svgs = [...text.matchAll(/<svg\b/gi)];
    if (svgs.length) add("svg", svgs[0].index, svgs.length > 1 ? `<svg ×${svgs.length}` : "<svg");
  }
  if (TEXT_EXT.has(ext)) {
    each(PLACEHOLDER, (m) => add("placeholder-copy", m.index, m[0]));
    each(PLACEHOLDER_TAG, (m) => add("placeholder-copy", m.index, m[0]));
    if (MARKUP_EXT.has(ext) || ext === ".mdx") for (const re of CLAIMS) each(re, (m) => add("claim-needs-proof", m.index, m[0]));
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

// Нечетим път се записва в `skipped` (ENOENT — висяща връзка — без грешка; всичко друго → изход 2).
const unreadable = (skipped, p, e) => skipped && skipped.push({ file: relative(process.cwd(), p) || p, why: `не се чете (${e.code || "грешка"})`, error: e.code !== "ENOENT" });
function walk(p, acc = [], skipped = null) {
  let st; try { st = statSync(p); } catch (e) { unreadable(skipped, p, e); return acc; }
  const scan = (n) => (TEXT_EXT.has(extname(n).toLowerCase()) || CODE_EXT.has(extname(n).toLowerCase())) && !isTestFile(n);
  if (st.isFile()) { if (scan(basename(p))) acc.push(p); return acc; }
  if (!st.isDirectory()) return acc;
  let names = []; try { names = readdirSync(p).sort(); } catch (e) { unreadable(skipped, p, e); return acc; }
  for (const n of names) {
    if (SKIP_DIRS.has(n) || isTestFile(n)) continue;
    if (n === "worktrees" && basename(p) === ".claude") continue;
    const q = join(p, n);
    let s; try { s = statSync(q); } catch (e) { unreadable(skipped, q, e); continue; }
    if (s.isDirectory()) walk(q, acc, skipped);
    else if (scan(n)) acc.push(q);
  }
  return acc;
}

/** Находките за папка или файл, с относителен път, + прескочените файлове (казват се, не изчезват тихо). */
export function lintPath(root) {
  const findings = [], skipped = [];
  const files = walk(root, [], skipped);
  const rel = (f) => relative(process.cwd(), f) || f;
  const read = (f, note = true) => {
    let t;
    try { t = readFileSync(f, "utf8"); } catch (e) { if (note) skipped.push({ file: rel(f), why: `не се чете (${e.code || "грешка"})`, error: true }); return null; }
    if (t.length > 2_000_000) { if (note) skipped.push({ file: rel(f), why: "над 2 MB — минифициран бъндъл, не изходен текст" }); return null; }
    return t;
  };
  // Първо минаване: :focus-visible правилата от всички CSS файлове (базов файл често рисува фокуса глобално).
  const globalFv = new Set();
  for (const f of files) if (/\.s?css$/i.test(f)) { const t = read(f, false); if (t) for (const b of focusVisibleBases(maskComments(t, extname(f).toLowerCase()))) globalFv.add(b); }
  for (const f of files) {
    const text = read(f);
    if (text === null) continue;
    for (const x of lintText(text, f, { globalFv })) findings.push({ file: rel(f), ...x });
  }
  findings.skipped = skipped;
  return findings;
}

function main(argv) {
  const json = argv.includes("--json");
  const root = argv.find((a) => !a.startsWith("--"));
  if (!root) { console.error("Употреба: node tools/design/design-lint.mjs <папка|файл> [--json]"); return 2; }
  // Грешен път не бива да изглежда като „0 находки“ (fail-closed).
  if (!existsSync(root)) { console.error(`design-lint: няма такъв път: ${root}`); return 2; }
  const findings = lintPath(root);
  const skipped = findings.skipped || [];
  const high = findings.filter((f) => f.sev === "HIGH").length;
  // Нечетим файл = непроверен файл → изход 2 (fail-closed), не тихо „чисто“.
  const code = skipped.some((x) => x.error) ? 2 : high ? 1 : 0;
  if (json) { console.log(JSON.stringify({ root, high, findings: [...findings], skipped }, null, 2)); return code; }
  for (const f of findings) console.log(`${f.sev.padEnd(6)} ${f.file}:${f.line}:${f.col}  ${f.rule} — ${f.why}\n         ${f.snippet}`);
  const by = (s) => findings.filter((f) => f.sev === s).length;
  for (const x of skipped) console.log(`SKIP   ${x.file} — ${x.why}`);
  console.log(`design-lint: ${findings.length} находки (HIGH ${high} · MEDIUM ${by("MEDIUM")} · INFO ${by("INFO")}) в ${root}${skipped.length ? ` · прескочени: ${skipped.length}` : ""}`);
  return code;
}

// exitCode, не process.exit(): голям --json към пайп иначе се реже (stdout е асинхронен).
if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
