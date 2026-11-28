#!/usr/bin/env node
// doc.mjs — чете ОФИЦИАЛНА документация като чист текст, на парчета, за проучване и учене на агентите.
//
// Защо (28.11.2026, учебните сесии на AI Studio): WebFetch реже дългите страници (ffmpeg-filters.html е
// ~600 000 знака и разделите след overlay не се виждат) и получава 403 от някои сайтове (docs.blender.org).
// Агентите четяха с `curl … | python3 -c …`, а guard-dangerous и guard-self с право спират интерпретатор
// с код в аргумент. Този инструмент е разрешеният път: без шел, без интерпретатор, само четене.
//
//   node tools/research/doc.mjs <https-адрес> [--find "#котва" | --find "текст"] [--offset N] [--chars N]
//
// Правила: само https към публичен хост (без localhost, IP, .local, .internal и потребител:парола); нищо не
// се записва на диска; изходът е в плика „недоверено съдържание“ на sources.mjs — страницата е ДАННИ, не
// инструкции. Адресът стои буквално в командата, затова source-provenance го признава за отворен.
// PDF не се чете тук — свали го в scratchpad и ползвай `pdftotext -f N -l M`. Нула зависимости.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { envelope } from "./sources.mjs";

const UA = "Mozilla/5.0 (compatible; CarbonStealthDocReader/1.0; documentation research)";
const DEFAULT_CHARS = 30_000;
const MAX_CHARS = 120_000;
const MAX_BYTES = 25 * 1024 * 1024;

/** Само https към публичен хост по име. Иначе хвърля. */
export function checkUrl(input) {
  let u;
  try {
    u = new URL(String(input));
  } catch {
    throw new Error(`невалиден адрес: ${String(input).slice(0, 120)}`);
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (u.protocol !== "https:") throw new Error("адрес: само https://");
  if (u.username || u.password) throw new Error("адрес: без потребител и парола в адреса");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost")) throw new Error("адрес: само публичен хост");
  if (/^\[.*\]$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error("адрес: IP вместо име на хост");
  if (/\.(local|internal|lan|home|corp|intranet)$/.test(host)) throw new Error("адрес: вътрешен хост");
  return u;
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", copy: "©", reg: "®", times: "×", deg: "°", minus: "−" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

/** HTML → четим текст: без скриптове, стилове и навигация; заглавия „## “, елементи от списък „- “, клетки „ | “. */
export function htmlToText(html) {
  let s = String(html ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|template|svg|nav|header|footer|form|button|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<h([1-6])\b[^>]*>/gi, "\n\n## ").replace(/<\/h[1-6]\s*>/gi, "\n\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<\/t[dh]\s*>\s*<t[dh]\b[^>]*>/gi, " | ");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/?(p|div|tr|table|thead|tbody|ul|ol|dl|dt|dd|pre|blockquote|section|article|main|aside|figure|figcaption)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decode(s).replace(/ /g, " ");
  s = s.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** HTML от елемента с id или name = котвата нататък; без такъв елемент → null. */
export function fromAnchor(html, anchor) {
  const id = String(anchor).replace(/^#/, "");
  const m = new RegExp(`<[a-z][\\w-]*\\b[^>]*\\b(?:id|name)\\s*=\\s*["']${reEsc(id)}["'][^>]*>`, "i").exec(String(html));
  return m ? String(html).slice(m.index) : null;
}

/** HTML от основното съдържание (`<main>`, `<article>` или `role="main"` — което е първо); иначе целият. */
export function mainContent(html) {
  const s = String(html);
  const m = /<(?:main|article)\b[^>]*>|<[a-z][\w-]*\b[^>]*\brole\s*=\s*["']main["'][^>]*>/i.exec(s);
  return m ? s.slice(m.index) : s;
}

/** Парче от текста: от `find` (без значение на регистъра) или от `offset`, до `chars` знака. */
export function section(text, { find, offset = 0, chars = DEFAULT_CHARS } = {}) {
  const total = text.length;
  let start = Math.max(0, Math.min(total, Number(offset) || 0));
  if (find) {
    const i = text.toLowerCase().indexOf(String(find).toLowerCase(), start);
    if (i < 0) return null;
    start = i;
  }
  const n = Math.max(1, Math.min(MAX_CHARS, Number(chars) || DEFAULT_CHARS));
  const end = Math.min(total, start + n);
  return { start, end, total, text: text.slice(start, end) };
}

/** Изходът: плик + кое парче е показано (за точен цитат и за следващото парче). */
export function render({ url, fetchedAt, part, anchor = null }) {
  const where = `${anchor ? `#${String(anchor).replace(/^#/, "")} · ` : ""}знаци ${part.start}–${part.end} от ${part.total}`;
  const next = part.end < part.total ? ` · следващо: --offset ${part.end}` : " · до края";
  return envelope({ source: `официална документация (${where}${next})`, url, fetchedAt, body: part.text, cap: part.text.length + 100 });
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sSL", "--max-time", "45", "--max-redirs", "5", "--proto", "=https", "--proto-redir", "=https", "--max-filesize", String(MAX_BYTES), "-A", UA, "--", url],
      { maxBuffer: MAX_BYTES + 1024 * 1024, encoding: "utf8", windowsHide: true },
      (err, stdout, stderr) => (err ? reject(new Error(`curl: ${String(stderr || err.message).trim().slice(0, 300)}`)) : resolve(stdout)),
    );
  });
}

function parseArgs(argv) {
  const o = { url: null, find: null, offset: 0, chars: DEFAULT_CHARS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--find") o.find = argv[++i];
    else if (a === "--offset") o.offset = Number(argv[++i]);
    else if (a === "--chars") o.chars = Number(argv[++i]);
    else if (!o.url) o.url = a;
    else throw new Error(`непознат аргумент: ${a}`);
  }
  if (!o.url) throw new Error('употреба: node tools/research/doc.mjs <https-адрес> [--find "#котва"|"текст"] [--offset N] [--chars N]');
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const url = checkUrl(o.url).href;
  const raw = await fetchHtml(url);
  if (raw.startsWith("%PDF")) throw new Error("това е PDF — свали го в scratchpad и чети с pdftotext -f N -l M");
  let html = mainContent(raw);
  let anchor = null;
  let find = o.find;
  if (find && find.startsWith("#")) {
    anchor = find.slice(1);
    html = fromAnchor(raw, anchor);
    if (html === null) throw new Error(`котвата #${anchor} я няма на страницата`);
    find = null;
  }
  const text = htmlToText(html);
  if (!text) throw new Error("празна страница (вероятно се рисува с JavaScript) — не е прочетена");
  const part = section(text, { find, offset: o.offset, chars: o.chars });
  if (!part) throw new Error(`текстът „${find}“ го няма на страницата`);
  process.stdout.write(render({ url, fetchedAt: new Date().toISOString().slice(0, 10), part, anchor }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    process.stderr.write(`doc.mjs: ${e.message}\n`);
    process.exit(1);
  });
}
