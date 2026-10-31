#!/usr/bin/env node
// live-check.mjs — НАМИРА ли търсачката сайта ни? Жива проверка в реда, в който минава тя:
// DNS → HTTP(S) и пренасочвания → robots.txt → sitemap → началната страница → извадка от sitemap-а.
//
//   node tools/seo/live-check.mjs                    # всички сайтове от tools/seo/sites.mjs
//   node tools/seo/live-check.mjs mastilko-bg.com    # един или няколко (домейн или пълен адрес)
//   node tools/seo/live-check.mjs --json             # суровият резултат (за агентите)
//   node tools/seo/live-check.mjs --check            # exit 1 при поне една блокираща находка
//   node tools/seo/live-check.mjs --sample 8         # адреси от sitemap-а за проверка (подразб. 4)
//
// ✘ сайтът не се намира/индексира (няма DNS, началната не отговаря, noindex, robots забранява,
//   canonical към друг хост) · ! вреди, но сайтът се намира · · бележка.
//
// Защо (2026-10-24, „сайтовете ни не се намират“): четири продукта нямаха DNS запис, www на
// mastilko даваше TLS отказ, nexus пращаше италианската и българската страница с canonical към
// английската, а 2214 страници на ospedali не бяха подадени към IndexNow. Нищо от това не се
// вижда в кода — само на живо. Инструментът само чете (GET); нищо не пише и не подава.
import { lookup as dnsLookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITES } from "./sites.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UA_GOOGLE = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const UA_BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
// Над тези дължини резултатът в търсачката се реже (≈600 px заглавие, ≈920 px описание).
const TITLE_MAX = 75;
const DESC_MAX = 170;
const KW_MIN = 5; // правилото на репото: ≥5 ключови думи, една „Carbon Stealth“
const THIN_TEXT = 250; // под толкова знака текст без JS страницата е празна обвивка
const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

// ── чисти функции (тествани без мрежа) ───────────────────────────────────────

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m;
    try {
      return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    } catch {
      return m;
    }
  });
}

/** Стойността на атрибут в един таг (`name="x"`, `name='x'`), без да хваща `data-name=`. */
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i")) || [])[2];

/** Каквото търсачка без JavaScript вижда в HTML-а на страницата. */
export function parsePage(html) {
  const head = String(html).slice(0, 300_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (name) => {
    const t = metas.find((x) => (attr(x, "name") || "").toLowerCase() === name);
    return t === undefined ? undefined : decode(attr(t, "content") ?? "").trim();
  };
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const canonicalTag = links.find((t) => /(^|\s)canonical(\s|$)/i.test(attr(t, "rel") || ""));
  const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ?? "").replace(/\s+/g, " ").trim();
  const ldTypes = [];
  let ldInvalid = 0;
  for (const [, block] of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (o["@type"]) ldTypes.push([].concat(o["@type"]).join("+"));
        if (o["@graph"]) walk(o["@graph"]);
      };
      walk(JSON.parse(block));
    } catch {
      ldInvalid++;
    }
  }
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const keywords = (meta("keywords") || "").split(",").map((k) => k.trim()).filter(Boolean);
  return {
    title,
    description: meta("description"),
    keywords,
    robots: [meta("robots"), meta("googlebot")].filter(Boolean).join(", "),
    canonical: canonicalTag ? decode(attr(canonicalTag, "href") || "").trim() : undefined,
    lang: (head.match(/<html\b[^>]*\slang\s*=\s*["']([^"']+)/i) || [])[1],
    hreflang: links.filter((t) => attr(t, "hreflang")).length,
    ldTypes: [...new Set(ldTypes)],
    ldInvalid,
    textLen: text.length,
  };
}

/**
 * robots.txt по RFC 9309: групи от поредни User-agent редове; ботът ползва СВОЯТА група, ако
 * има такава, иначе `*`; за даден път печели най-дългото съвпадащо правило, при равенство Allow.
 */
export function parseRobots(txt) {
  const body = String(txt);
  const html = /^\s*<(!doctype|html)/i.test(body);
  const sitemaps = [...body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow") && val) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const rulesFor = (bot) => {
    const own = groups.filter((g) => g.agents.some((a) => a !== "*" && bot.toLowerCase().startsWith(a)));
    return (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  };
  const matches = (rule, path) => {
    const anchored = rule.endsWith("$");
    const pat = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pat}${anchored ? "$" : ""}`).test(path);
  };
  const allows = (bot, path) => {
    let best = null;
    for (const r of rulesFor(bot)) {
      if (!matches(r.path, path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return !best || best.allow;
  };
  return { html, sitemaps, allows };
}

export const locs = (xml) =>
  [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]).trim()).filter(Boolean);

/** www.x.y ↔ x.y — само за апекс с два етикета и за www; поддомейн (a.x.y) няма двойник. */
export function altHost(host) {
  const labels = host.split(".");
  if (labels[0] === "www" && labels.length > 2) return labels.slice(1).join(".");
  if (labels.length === 2) return `www.${host}`;
  return null;
}

const norm = (u) => {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, "")}${x.search}`;
  } catch {
    return String(u);
  }
};
const safeURL = (u, base) => {
  try {
    return new URL(u, base);
  } catch {
    return null;
  }
};
const spread = (arr, n) => {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
};

// ── мрежа ────────────────────────────────────────────────────────────────────

const errCode = (e) =>
  e?.name === "TimeoutError" ? "таймаут" : String(e?.cause?.code || e?.cause?.message || e?.message || e).slice(0, 90);

/** GET с проследени пренасочвания (до `max`); връща веригата, крайния адрес и тялото. */
async function get(url, ua, { max = 8, timeout = 20000 } = {}) {
  const chain = [];
  let cur = url;
  for (let i = 0; ; i++) {
    let r;
    try {
      r = await fetch(cur, {
        redirect: "manual",
        headers: { "user-agent": ua, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      return { chain, url: cur, error: errCode(e) };
    }
    chain.push({ url: cur, status: r.status });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      await r.body?.cancel().catch(() => {});
      if (i >= max) return { chain, url: cur, status: r.status, location: new URL(loc, cur).href, error: i ? "твърде много пренасочвания" : undefined };
      cur = new URL(loc, cur).href;
      continue;
    }
    const body = await r.text().catch(() => "");
    return { chain, url: cur, status: r.status, headers: r.headers, body };
  }
}

async function readSitemap(url, depth = 0) {
  const r = await get(url, UA_GOOGLE);
  if (r.error || r.status !== 200) return { url, status: r.status, error: r.error, urls: [] };
  if (!/<(urlset|sitemapindex)[\s>]/i.test(r.body)) return { url, status: r.status, notXml: true, urls: [] };
  const found = locs(r.body);
  if (/<sitemapindex[\s>]/i.test(r.body) && depth === 0) {
    const kids = await Promise.all(found.slice(0, 50).map((u) => readSitemap(u, 1)));
    return {
      url,
      status: 200,
      index: kids.length,
      broken: kids.filter((k) => !k.urls.length).map((k) => k.url),
      urls: kids.flatMap((k) => k.urls),
      newest: kids.map((k) => k.newest).filter(Boolean).sort().at(-1),
    };
  }
  const newest = [...r.body.matchAll(/<lastmod>\s*([^<\s]+)/gi)].map((m) => m[1]).sort().at(-1);
  return { url, status: 200, urls: found, newest };
}

const toOrigin = (input) => new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).origin;

/**
 * Пълната проверка на един сайт. `lookup` е подменяем (тестовете не питат истински DNS);
 * `key` е пътят в репото до файла с IndexNow ключа (tools/seo/sites.mjs).
 */
export async function checkSite(input, { sample = 4, key, lookup = dnsLookup } = {}) {
  const origin = toOrigin(input);
  const host = new URL(origin).hostname;
  const res = { site: origin, findings: [], facts: {} };
  const add = (level, msg) => res.findings.push({ level, msg });
  const local = Boolean(isIP(host)) || host === "localhost";

  if (!local) {
    try {
      await lookup(host);
    } catch (e) {
      add("block", e?.code === "ENOTFOUND"
        ? `няма DNS запис (A/AAAA) за ${host} — сайтът не съществува за никого, вкл. търсачките`
        : `DNS грешка за ${host}: ${e?.code || e?.message}`);
      return res;
    }
  }

  // ── началната страница: както я вижда Googlebot ──
  const g = await get(`${origin}/`, UA_GOOGLE);
  if (g.error || g.status >= 400) {
    add("block", `началната не отговаря на Googlebot: ${g.error || g.status} (${g.url})`);
    return res;
  }
  const final = new URL(g.url);
  res.facts.status = g.status;
  res.facts.final = g.url;
  if (g.chain.length > 3) add("warn", `${g.chain.length - 1} пренасочвания до началната (${g.chain.map((c) => c.status).join(" → ")}) — дръж ги до едно`);
  const b = await get(`${origin}/`, UA_BROWSER);
  if ((b.status ?? b.error) !== g.status) add("warn", `Googlebot получава ${g.status}, браузърът — ${b.status ?? b.error}`);

  const p = parsePage(g.body);
  const xRobots = g.headers.get("x-robots-tag") || "";
  if (/noindex/i.test(`${p.robots} ${xRobots}`)) {
    add("block", `началната е noindex (${/noindex/i.test(p.robots) ? `meta robots „${p.robots}“` : `X-Robots-Tag „${xRobots}“`})`);
  }
  if (!p.canonical) add("warn", "началната няма canonical");
  else {
    const c = safeURL(p.canonical, g.url);
    if (!c) add("warn", `canonical не е валиден адрес: „${p.canonical}“`);
    else if (c.host !== final.host) add("block", `canonical сочи друг хост (${c.href}) — индексира се той, не ${final.host}`);
    else if (norm(c.href) !== norm(g.url)) add("warn", `canonical на началната сочи ${c.href}, не самата нея`);
  }
  if (!p.title) add("warn", "няма <title>");
  else if (p.title.length > TITLE_MAX) add("warn", `заглавието е ${p.title.length} знака — в резултатите се реже около 60–75`);
  if (!p.description) add("warn", "няма meta description");
  else if (p.description.length > DESC_MAX) add("warn", `описанието е ${p.description.length} знака — в резултатите се реже около 155–160`);
  if (p.keywords.length < KW_MIN) add("warn", `ключови думи: ${p.keywords.length} (правилото на репото: поне ${KW_MIN})`);
  if (!p.keywords.some((k) => /carbon stealth/i.test(k))) add("warn", "„Carbon Stealth“ липсва в ключовите думи (правилото на репото)");
  if (!p.lang) add("warn", "<html> няма lang");
  if (p.textLen < THIN_TEXT) add("warn", `без JavaScript началната има само ${p.textLen} знака текст — търсачка без JS вижда празна обвивка`);
  if (p.ldInvalid) add("warn", `${p.ldInvalid} невалиден JSON-LD блок (JSON.parse пада)`);
  res.facts.page = { title: p.title, descLen: p.description?.length ?? 0, keywords: p.keywords.length, lang: p.lang, hreflang: p.hreflang, ld: p.ldTypes };

  // ── http → https и двойникът с/без www ──
  if (!local && final.protocol === "https:") {
    const h = await get(`http://${host}/`, UA_BROWSER, { max: 0 });
    if (h.error && !h.location) add("warn", `http://${host}/ не отговаря (${h.error}) — старите http линкове не стигат`);
    else if (h.location && ![301, 308].includes(h.status)) add("warn", `http → https е временно пренасочване (${h.status}) — трябва 301`);
    else if (!h.location) add("warn", `http://${host}/ не пренасочва към https (${h.status})`);
    else if (!/^https:/i.test(h.location)) add("warn", `http пренасочва към ${h.location}, не към https`);
  }
  const alt = local ? null : altHost(host);
  if (alt) {
    let resolves = true;
    try {
      await lookup(alt);
    } catch {
      resolves = false;
    }
    if (!resolves) add("info", `${alt} няма DNS запис — който го напише, не стига до сайта`);
    else {
      const a = await get(`https://${alt}/`, UA_BROWSER);
      if (a.error || a.status >= 400) add("warn", `https://${alt}/ не стига до сайта (${a.error || a.status})`);
      else if (new URL(a.url).host !== final.host) add("warn", `${alt} отговаря сам (${a.status}), без 301 към ${final.host} — две копия на сайта`);
    }
  }

  // ── robots.txt ──
  const fo = final.origin;
  const rb = await get(`${fo}/robots.txt`, UA_GOOGLE);
  let robots = null;
  if (rb.error || rb.status >= 500) add("block", `robots.txt: ${rb.error || rb.status} — при грешка на сървъра Google спира обхождането`);
  else if (rb.status >= 400) add("info", `няма robots.txt (${rb.status}) — всичко е разрешено, но sitemap-ът не е обявен`);
  else {
    robots = parseRobots(rb.body);
    if (robots.html) {
      add("warn", "robots.txt връща HTML (SPA fallback?) — търсачките го четат като празен");
      robots = null;
    } else {
      if (!robots.allows("googlebot", "/")) add("block", "robots.txt забранява началната на Googlebot");
      if (!robots.allows("bingbot", "/")) add("block", "robots.txt забранява началната на Bing (а през него и на IndexNow търсачките)");
      if (!robots.sitemaps.length) add("warn", "robots.txt не обявява sitemap (ред Sitemap:)");
    }
  }

  // ── sitemap ──
  const smList = robots?.sitemaps.length ? robots.sitemaps.slice(0, 5) : [`${fo}/sitemap.xml`];
  const sms = await Promise.all(smList.map((u) => readSitemap(u)));
  for (const s of sms) {
    if (s.error || s.status !== 200) add("warn", `sitemap ${s.url}: ${s.error || s.status}`);
    else if (s.notXml) add("warn", `sitemap ${s.url} не е XML (HTML страница вместо sitemap?)`);
    else if (s.broken?.length) add("warn", `${s.broken.length} под-sitemap-а не се четат: ${s.broken.slice(0, 3).join(", ")}`);
  }
  const urls = [...new Set(sms.flatMap((s) => s.urls))];
  res.facts.sitemap = { urls: urls.length, newest: sms.map((s) => s.newest).filter(Boolean).sort().at(-1) };
  if (sms.some((s) => s.status === 200 && !s.notXml) && !urls.length) add("warn", "sitemap-ът е празен");
  const foreign = [...new Set(urls.map((u) => safeURL(u)?.host).filter((h) => h && h !== final.host))];
  if (foreign.length) add("warn", `sitemap-ът е на ${final.host}, а съдържа адреси на ${foreign.slice(0, 3).join(", ")} — важат само при потвърден собственик и на двата хоста (Search Console)`);

  // ── извадка от sitemap-а ──
  const picked = spread(urls.filter((u) => norm(u) !== norm(g.url) && safeURL(u)?.host === final.host), sample);
  for (const u of picked) {
    const r = await get(u, UA_GOOGLE);
    if (r.error || r.status >= 400) {
      add("warn", `${u}: ${r.error || r.status} — в sitemap-а е, но не отговаря`);
      continue;
    }
    if (norm(r.url) !== norm(u)) add("warn", `${u} пренасочва към ${r.url} — в sitemap-а трябва крайният адрес`);
    const sp = parsePage(r.body);
    if (/noindex/i.test(`${sp.robots} ${r.headers.get("x-robots-tag") || ""}`)) add("warn", `${u} е noindex, а е в sitemap-а`);
    const c = sp.canonical && safeURL(sp.canonical, r.url);
    if (c && norm(c.href) !== norm(r.url)) add("warn", `${u} има canonical към ${c.href} — в sitemap-а трябват само каноничните`);
    if (robots && !robots.allows("googlebot", new URL(r.url).pathname)) add("warn", `${u} е в sitemap-а, но robots.txt го забранява`);
  }
  res.facts.sampled = picked.length;

  // ── IndexNow ключ и llms.txt ──
  let k = "";
  if (key) {
    k = (await readFile(resolve(ROOT, key), "utf8").catch(() => "")).trim();
    if (!k) add("warn", `IndexNow: ключовият файл ${key} липсва в репото`);
  }
  const tries = [`${fo}/indexnow-key.txt`, ...(k ? [`${fo}/${k}.txt`] : [])];
  for (const t of tries) {
    const r = await get(t, UA_BROWSER, { max: 2 });
    const body = (r.body || "").trim();
    if (r.status === 200 && (k ? body === k : KEY_RE.test(body))) {
      res.facts.indexnow = new URL(t).pathname;
      break;
    }
  }
  if (!res.facts.indexnow) {
    if (k) add("warn", `IndexNow: ключът от ${key} не се сервира на живо — деплойни`);
    else add("info", "IndexNow ключ не се вижда на /indexnow-key.txt (може да е на /<ключ>.txt — провери с tools/seo/indexnow.mjs --dry-run)");
  }
  const llms = await get(`${fo}/llms.txt`, UA_BROWSER, { max: 3 });
  res.facts.llms = llms.status === 200 && !/^\s*<(!doctype|html)/i.test(llms.body || "");
  if (!res.facts.llms) add("info", "няма llms.txt");
  return res;
}

// ── отчет ────────────────────────────────────────────────────────────────────

const ORDER = { block: 0, warn: 1, info: 2 };
const ICON = { block: "✘", warn: "!", info: "·" };
export const verdict = (r) =>
  r.findings.some((f) => f.level === "block") ? "block" : r.findings.some((f) => f.level === "warn") ? "warn" : "ok";

export function format(r) {
  const v = verdict(r);
  const lines = [`${v === "block" ? "✘" : v === "warn" ? "!" : "✓"} ${r.site}${r.product ? `  (${r.product})` : ""}`];
  const f = r.facts;
  if (f.status) {
    const sm = f.sitemap ? ` · sitemap ${f.sitemap.urls} адреса${f.sitemap.newest ? ` (последна промяна ${f.sitemap.newest.slice(0, 10)})` : ""}` : "";
    const extra = [f.sampled ? `проверени ${f.sampled}` : "", f.indexnow ? `IndexNow ${f.indexnow}` : "", f.page?.ld?.length ? `JSON-LD ${f.page.ld.slice(0, 4).join(", ")}` : ""].filter(Boolean);
    lines.push(`    ${f.status} ${f.final}${sm}${extra.length ? ` · ${extra.join(" · ")}` : ""}`);
  }
  for (const x of [...r.findings].sort((a, b) => ORDER[a.level] - ORDER[b.level])) lines.push(`    ${ICON[x.level]} ${x.msg}`);
  if (r.note) lines.push(`    (${r.note})`);
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json");
  const check = argv.includes("--check");
  const si = argv.indexOf("--sample");
  const sample = si >= 0 ? Math.max(0, Number(argv[si + 1]) || 0) : 4;
  const args = argv.filter((a, i) => !a.startsWith("--") && !(si >= 0 && i === si + 1));
  const targets = args.length
    ? args.map((a) => {
        const o = toOrigin(a);
        return SITES.find((s) => toOrigin(s.url) === o) || { url: o };
      })
    : SITES;
  const results = await Promise.all(
    targets.map(async (s) => {
      const r = await checkSite(s.url, { sample, key: s.key }).catch((e) => ({ site: s.url, findings: [{ level: "block", msg: `проверката гръмна: ${errCode(e)}` }], facts: {} }));
      return { product: s.product, note: s.note, ...r };
    }),
  );
  if (json) process.stdout.write(JSON.stringify(results, null, 1) + "\n");
  else {
    console.log(results.map(format).join("\n\n"));
    const n = (v) => results.filter((r) => verdict(r) === v).length;
    console.log(`\n${results.length} сайта · ✘ ${n("block")} не се намират/индексират · ! ${n("warn")} с бележки · ✓ ${n("ok")} чисти`);
  }
  if (check && results.some((r) => verdict(r) === "block")) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
