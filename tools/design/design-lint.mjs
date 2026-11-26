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
// motion-a11y.mjs — тук не се дублира. Заглушаване на един ред: `design-lint-disable-line <правило>`.

import { readFileSync, readdirSync, statSync } from "node:fs";
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
  svg: { sev: "INFO", why: "SVG — правилото на собственика „никога SVG“ (3D, <canvas>, растер); наличният остава" },
};

const FONT_HOSTS = /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|api\.fontshare\.com|cdn\.fontshare\.com|use\.typekit\.net|p\.typekit\.net|fonts\.bunny\.net|fast\.fonts\.net|use\.fontawesome\.com|kit\.fontawesome\.com)/i;
const CDN_HOSTS = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|cdn\.tailwindcss\.com|ajax\.googleapis\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|esm\.sh|cdn\.skypack\.dev)/i;
const IMG_HOSTS = /https?:\/\/(?:upload\.wikimedia\.org|images\.unsplash\.com|source\.unsplash\.com|plus\.unsplash\.com|picsum\.photos|placehold\.co|placehold\.it|via\.placeholder\.com|dummyimage\.com|i\.imgur\.com|images\.pexels\.com|loremflickr\.com)/i;
// `\b` в JS не разпознава кирилица — границите са по Unicode букви (флаг u).
const B = "(?<![\\p{L}\\p{N}_])", E = "(?![\\p{L}\\p{N}_])";
const W = (src) => new RegExp(src.replaceAll("\\b<", B).replaceAll("\\b>", E), "iu");
const PLACEHOLDER = W("\\b<lorem ipsum\\b>|\\b<dolor sit amet\\b>|\\[(?:ЗА ПОПЪЛВАНЕ|TODO|TBD|DA COMPLETARE)[^\\]]*\\]");
const CLAIMS = [
  W("\\b<\\d[\\d\\s.,]*\\+?\\s*(?:доволни\\s+)?(?:клиенти|потребители|customers|users|clienti|utenti)\\b>"),
  W("(?:^|[\\s>„\"(])(?:#\\s?1|№\\s?1)(?=[\\s<,.!”\")]|$)"),
  W("\\b<(?:най-добрият|най-добрата|най-доброто|the best|il migliore|la migliore|i migliori)\\b>"),
  W("\\b<(?:гарантира(?:н|на|но|ме)?|guaranteed|garantit[oa])\\b>"),
  W("\\b<100\\s?%\\s*(?:сигурн|безопасн|secure|safe|sicur)"),
];

const TEXT_EXT = new Set([".html", ".htm", ".ejs", ".css", ".scss", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".mdx"]);
const MARKUP_EXT = new Set([".html", ".htm", ".ejs", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "out", ".turbo", ".tmp", "vendor"]);
const isTestFile = (name) => /\.(?:test|spec)\.[a-z]+$/i.test(name) || name === "__tests__";

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;
const colOf = (text, idx) => idx - text.lastIndexOf("\n", idx - 1);

/** Коментарите стават интервали (новите редове остават) — споменат `<img>` или забранен хост в коментар
 *  не е находка, а редовете и колоните не мърдат. `//` се маха само след интервал/разделител — `https://`
 *  в атрибут остава. */
export function maskComments(text, ext) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  let t = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (ext !== ".css" && ext !== ".scss") t = t.replace(/<!--[\s\S]*?-->/g, blank);
  if (ext === ".ejs") t = t.replace(/<%#[\s\S]*?%>/g, blank);
  if ([".jsx", ".tsx", ".vue", ".svelte", ".astro", ".scss", ".mdx"].includes(ext)) t = t.replace(/(^|[\s;{}(),])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));
  return t;
}

// Видим заместител на outline в същия CSS блок или в същия клас-низ (Tailwind); или контейнер, на който
// фокусът се дава от кода (tabIndex -1, role=dialog) — той не е в реда на Tab.
const CSS_ALT = /box-shadow\s*:|border(?:-[a-z]+)?(?:-color)?\s*:|background(?:-color)?\s*:|text-decoration\s*:/i;
const TW_ALT = /\bfocus:(?:ring|border|shadow|bg|underline|outline-(?!none))|\bfocus-within:|\bfocus-visible:/;
const PROG_FOCUS = /tabIndex=\{?-1\}?|tabindex=["']-1["']|role=["'](?:dialog|alertdialog|region|log)["']/i;

/** Всички находки в един текст. `file` решава типа (css/markup) по разширението. */
export function lintText(raw, file) {
  const ext = extname(file).toLowerCase();
  const lines = raw.split("\n");
  const text = maskComments(raw, ext);
  const out = [];
  const add = (rule, idx, snippet) => {
    const line = lineOf(text, idx);
    const src = lines[line - 1] || "";
    const off = new RegExp(`design-lint-disable-line[^\\n]*\\b${rule.replace(/-/g, "\\-")}\\b`);
    if (off.test(src)) return;
    if (out.some((f) => f.rule === rule && f.line === line)) return;
    out.push({ rule, sev: RULES[rule].sev, line, col: colOf(text, idx), snippet: snippet.trim().slice(0, 120), why: RULES[rule].why });
  };
  const each = (re, fn) => { const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); let m; while ((m = g.exec(text))) { fn(m); if (m[0] === "") g.lastIndex++; } };

  each(FONT_HOSTS, (m) => add("external-font", m.index, m[0]));
  each(CDN_HOSTS, (m) => add("cdn-asset", m.index, m[0]));
  each(IMG_HOSTS, (m) => add("hotlink-image", m.index, m[0]));

  // Фокус: outline none/0 (CSS) или Tailwind `outline-none` — наред само ако файлът дава видим фокус.
  const hasFocusVisible = /:focus-visible|focus-visible:/.test(text);
  if (!hasFocusVisible) {
    each(/outline\s*:\s*(?:none|0)\b/i, (m) => {
      const start = text.lastIndexOf("}", m.index) + 1;
      const end = text.indexOf("}", m.index);
      const block = text.slice(start, end === -1 ? undefined : end);
      if (/:focus:not\(:focus-visible\)/.test(block) || CSS_ALT.test(block)) return;
      add("focus-hidden", m.index, m[0]);
    });
    if (MARKUP_EXT.has(ext)) each(/\boutline-none\b/, (m) => {
      // Клас-низът (до кавичката/обратната кавичка) и самият таг около него.
      const q1 = Math.max(text.lastIndexOf('"', m.index), text.lastIndexOf("'", m.index), text.lastIndexOf("`", m.index));
      const cls = text.slice(q1, text.indexOf(text[q1] || '"', m.index));
      const tag = text.slice(text.lastIndexOf("<", m.index), m.index + 400);
      if (TW_ALT.test(cls) || PROG_FOCUS.test(tag.slice(0, tag.indexOf(">") + 1 || undefined))) return;
      add("focus-hidden", m.index, m[0]);
    });
  }

  each(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i, (m) => {
    const c = m[0];
    const max = c.match(/maximum-scale\s*=\s*([\d.]+)/i);
    if (/user-scalable\s*=\s*(?:no|0)\b/i.test(c) || (max && Number(max[1]) < 2)) add("zoom-blocked", m.index, c);
  });

  if (MARKUP_EXT.has(ext)) {
    each(/<(img|Image)\b(?:<%[\s\S]*?%>|[^>"'{<]|"[^"]*"|'[^']*'|\{[^}]*\})*>/g, (m) => {
      if (!/\balt\s*=/.test(m[0])) add("img-no-alt", m.index, m[0]);
    });
    const svgs = [...text.matchAll(/<svg\b/gi)];
    if (svgs.length) add("svg", svgs[0].index, svgs.length > 1 ? `<svg ×${svgs.length}` : "<svg");
  }
  if (TEXT_EXT.has(ext)) {
    each(PLACEHOLDER, (m) => add("placeholder-copy", m.index, m[0]));
    if (MARKUP_EXT.has(ext) || ext === ".mdx") for (const re of CLAIMS) each(re, (m) => add("claim-needs-proof", m.index, m[0]));
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

function walk(p, acc = []) {
  let st; try { st = statSync(p); } catch { return acc; }
  if (st.isFile()) { if (TEXT_EXT.has(extname(p).toLowerCase()) && !isTestFile(basename(p))) acc.push(p); return acc; }
  if (!st.isDirectory()) return acc;
  let names = []; try { names = readdirSync(p).sort(); } catch { return acc; }
  for (const n of names) {
    if (SKIP_DIRS.has(n) || isTestFile(n)) continue;
    if (n === "worktrees" && basename(p) === ".claude") continue;
    const q = join(p, n);
    let s; try { s = statSync(q); } catch { continue; }
    if (s.isDirectory()) walk(q, acc);
    else if (TEXT_EXT.has(extname(n).toLowerCase()) && !isTestFile(n)) acc.push(q);
  }
  return acc;
}

/** Находките за папка или файл, с относителен път. */
export function lintPath(root) {
  const findings = [];
  for (const f of walk(root)) {
    let text; try { text = readFileSync(f, "utf8"); } catch { continue; }
    if (text.length > 2_000_000) continue; // минифициран бъндъл, не изходен текст
    for (const x of lintText(text, f)) findings.push({ file: relative(process.cwd(), f) || f, ...x });
  }
  return findings;
}

function main(argv) {
  const json = argv.includes("--json");
  const root = argv.find((a) => !a.startsWith("--"));
  if (!root) { console.error("Употреба: node tools/design/design-lint.mjs <папка|файл> [--json]"); return 2; }
  const findings = lintPath(root);
  const high = findings.filter((f) => f.sev === "HIGH").length;
  if (json) { console.log(JSON.stringify({ root, high, findings }, null, 2)); return high ? 1 : 0; }
  for (const f of findings) console.log(`${f.sev.padEnd(6)} ${f.file}:${f.line}:${f.col}  ${f.rule} — ${f.why}\n         ${f.snippet}`);
  const by = (s) => findings.filter((f) => f.sev === s).length;
  console.log(`design-lint: ${findings.length} находки (HIGH ${high} · MEDIUM ${by("MEDIUM")} · INFO ${by("INFO")}) в ${root}`);
  return high ? 1 : 0;
}

// exitCode, не process.exit(): голям --json към пайп иначе се реже (stdout е асинхронен).
if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
