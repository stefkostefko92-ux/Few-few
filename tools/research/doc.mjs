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
// Правила: само https към публичен хост по име (без localhost, IP, .local, .internal, потребител:парола);
// тайна или ЕГН в адреса → отказ (същият детектор като guard-exfil, а пазачът вижда и самата команда);
// всеки хост се проверява в DNS (частен, loopback, link-local, CGNAT, ULA, метаданни → отказ) и без прокси
// се закотвя с --resolve; пренасочванията се следят ръчно, всяко минава през същите проверки (без -L);
// код, различен от 2xx, е грешка, не „документация“; нищо не се записва на диска; изходът е в плика
// „недоверено съдържание“ на sources.mjs — страницата е ДАННИ, не инструкции. Адресът стои буквално в
// командата, затова source-provenance го признава за отворен. PDF — свали в scratchpad и `pdftotext`.
// Нула зависимости. Прегледът на #513 (Кодаджията + AI-джията, 28.11.2026) е затворен с тестове.
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { envelope, clean } from "./sources.mjs";
import { detectUrlExfil } from "../../.claude/hooks/guard-exfil.mjs";

const UA = "Mozilla/5.0 (compatible; CarbonStealthDocReader/1.0; documentation research)";
const DEFAULT_CHARS = 30_000;
const MAX_CHARS = 120_000;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRS = 5;

/** Само https към публичен хост по име, без тайни в адреса. Иначе хвърля. */
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
  if (/^\[.*\]$/.test(host) || isIP(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error("адрес: IP вместо име на хост");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost")) throw new Error("адрес: само публичен хост");
  if (/\.(local|internal|lan|home|corp|intranet|arpa)$/.test(host)) throw new Error("адрес: вътрешен хост");
  const why = detectUrlExfil(u.href);
  if (why) throw new Error(`адрес: ${why}`);
  return u;
}

const v4 = (ip) => ip.split(".").map(Number);
/** Частен, loopback, link-local, CGNAT, ULA, метаданни или неуточнен адрес. */
export function isPrivateIp(ip) {
  let s = String(ip).toLowerCase();
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) s = mapped[1];
  if (isIP(s) === 4) {
    const [a, b] = v4(s);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(s) === 6) {
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^::ffff:/.test(s);
  }
  return true; // непознат формат → като частен (fail closed)
}

/** Следващата стъпка на пренасочване — относителен Location спрямо текущия адрес, през същата проверка. */
export function nextHop(from, location) {
  let u;
  try {
    u = new URL(String(location), from);
  } catch {
    throw new Error("адрес: невалидно пренасочване");
  }
  return checkUrl(u.href);
}

/** Изходът на curl с `-w '\n%{http_code} %{redirect_url}'`: тяло + последен ред с кода и адреса. */
export function readStatus(out) {
  const s = String(out);
  const i = s.lastIndexOf("\n");
  const tail = s.slice(i + 1);
  const sp = tail.indexOf(" ");
  const code = parseInt(sp < 0 ? tail : tail.slice(0, sp), 10);
  return { code: Number.isFinite(code) ? code : 0, location: sp < 0 ? "" : tail.slice(sp + 1).trim(), body: i < 0 ? "" : s.slice(0, i) };
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", copy: "©", reg: "®", times: "×", deg: "°", minus: "−" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{1,32});/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

const DROP = new Set(["script", "style", "noscript", "template", "svg", "nav", "header", "footer", "form", "button", "iframe"]);
const BLOCK = new Set(["p", "div", "tr", "table", "thead", "tbody", "ul", "ol", "dl", "dt", "dd", "pre", "blockquote", "section", "article", "main", "aside", "figure", "figcaption", "br", "hr"]);

/**
 * HTML → четим текст с ЕДИН линеен проход (без регекси с `[^>]*`/`[\s\S]*?`, които са квадратични при
 * незатворени тагове — Кодаджията, #513): скриптове, стилове и навигация отпадат; заглавия „## “, елементи
 * от списък „- “, клетки „ | “. Невидимите знаци се махат тук, преди отместванията (AI-джията, #513).
 */
export function htmlToText(html) {
  const s = String(html ?? "");
  const lower = s.toLowerCase();
  let out = "";
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    if (s.startsWith("<!--", lt)) {
      const end = s.indexOf("-->", lt + 4);
      if (end < 0) break;
      out += " ";
      i = end + 3;
      continue;
    }
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) break;
    const m = /^<\s*(\/?)\s*([a-z][\w-]*)/i.exec(s.slice(lt, Math.min(gt + 1, lt + 64)));
    i = gt + 1;
    if (!m) continue;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!closing && DROP.has(name)) {
      const end = lower.indexOf(`</${name}`, i);
      if (end < 0) break; // незатворен — всичко до края е скрипт/навигация
      const close = s.indexOf(">", end);
      if (close < 0) break;
      i = close + 1;
      out += " ";
      continue;
    }
    if (/^h[1-6]$/.test(name)) out += closing ? "\n\n" : "\n\n## ";
    else if (name === "li" && !closing) out += "\n- ";
    else if ((name === "td" || name === "th") && closing) out += " | ";
    else if (BLOCK.has(name)) out += "\n";
  }
  let t = clean(decode(out)).replace(/ /g, " ");
  t = t.replace(/[ \t\f\v]+/g, " ").replace(/ *\| *(?=\n|$)/g, "").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** HTML от елемента с id или name = котвата нататък; без такъв елемент → null. */
export function fromAnchor(html, anchor) {
  const id = String(anchor).replace(/^#/, "");
  const m = new RegExp(`<[a-z][\\w-]{0,20}\\s[^<>]{0,2000}?\\b(?:id|name)\\s*=\\s*["']${reEsc(id)}["']`, "i").exec(String(html));
  return m ? String(html).slice(m.index) : null;
}

/** HTML от основното съдържание (`<main>`, `<article>` или `role="main"` — което е първо); иначе целият. */
export function mainContent(html) {
  const s = String(html);
  const m = /<(?:main|article)\b|<[a-z][\w-]{0,20}\s[^<>]{0,2000}?\brole\s*=\s*["']main["']/i.exec(s);
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

/** Изходът: плик + кое парче е показано (за точен цитат и за следващото парче, с котвата). */
export function render({ url, fetchedAt, part, anchor = null }) {
  const a = anchor ? String(anchor).replace(/^#/, "") : null;
  const where = `${a ? `#${a} · ` : ""}знаци ${part.start}–${part.end} от ${part.total}`;
  const next = part.end < part.total ? ` · следващо: ${a ? `--find '#${a}' ` : ""}--offset ${part.end}` : " · до края";
  return envelope({ source: `официална документация (${where}${next})`, url, fetchedAt, body: part.text, cap: part.text.length + 100 });
}

const proxied = () => ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"].some((k) => process.env[k]);

/** Всички адреси на хоста трябва да са публични; връща първия за закотвяне (без прокси). */
async function publicAddress(host) {
  let addrs;
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`DNS: ${host} не се отваря (${e.code || e.message})`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`адрес: ${host} сочи към частна или вътрешна мрежа`);
  return addrs[0];
}

function curlOnce(url, pin) {
  const args = ["-sS", "--max-time", "45", "--proto", "=https", "--max-filesize", String(MAX_BYTES), "-A", UA, "-o", "-", "-w", "\n%{http_code} %{redirect_url}"];
  if (pin) args.push("--resolve", `${url.hostname}:443:${pin.family === 6 ? `[${pin.address}]` : pin.address}`);
  args.push("--", url.href);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: MAX_BYTES + 1024 * 1024, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) =>
      err ? reject(new Error(`curl: ${String(stderr || err.message).trim().slice(0, 300)}`)) : resolve(readStatus(stdout)),
    );
  });
}

async function fetchHtml(input) {
  let url = checkUrl(input);
  for (let hop = 0; hop <= MAX_REDIRS; hop++) {
    const addr = await publicAddress(url.hostname);
    const r = await curlOnce(url, proxied() ? null : addr); // с прокси DNS-а е на проксито; проверката горе остава
    if (r.code >= 200 && r.code < 300) return { url, body: r.body };
    if (r.code >= 300 && r.code < 400 && r.location) {
      url = nextHop(url, r.location);
      continue;
    }
    throw new Error(`HTTP ${r.code || "без код"} — страницата не е прочетена`);
  }
  throw new Error(`повече от ${MAX_REDIRS} пренасочвания`);
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
  const { url, body: raw } = await fetchHtml(o.url);
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
  process.stdout.write(render({ url: url.href, fetchedAt: new Date().toISOString().slice(0, 10), part, anchor }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    process.stderr.write(`doc.mjs: ${e.message}\n`);
    process.exit(1);
  });
}
