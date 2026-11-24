#!/usr/bin/env node
// trust-check.mjs — сигналите за ДОВЕРИЕ на живите ни сайтове (SEO агентът; плейбук: tools/seo/doverie.md).
//
// Защо (24.11.2026, искане на собственика „доверие и авторитет възможно най-бързо“): по Search Quality Rater
// Guidelines доверието е най-важният елемент на E-E-A-T и се съди по това кой стои зад сайта, как се свързваш с него
// и какво казват трети страни. Третото не се мери с код; първите две — да. Този инструмент ги проверява детерминистично,
// за да не разчитаме на поглед: идентичност (Organization/LocalBusiness JSON-LD с @id, sameAs, лого, контакт, ЕИК/ДДС),
// страниците за доверие (За нас, Контакт, Поверителност, Правна информация), HSTS, security.txt (RFC 9116), собствени
// звезди в разметката (Google не ги позволява за Organization/LocalBusiness) и дали контактът от схемата се вижда.
//
//   node tools/seo/trust-check.mjs                     # всички сайтове от tools/seo/sites.mjs
//   node tools/seo/trust-check.mjs mastilko-bg.com     # един или няколко
//   node tools/seo/trust-check.mjs --json              # суровият резултат (за агентите)
//   node tools/seo/trust-check.mjs --check             # изход 1 при поне един твърд провал
//
// Само HTTPS GET на началната страница и на /.well-known/security.txt; без бисквитки, без изпращане на данни.
// Какво НЕ мери: независимо покритие, истинност на отзивите, квалификация на авторите — това е ръчен преглед.
// ✘ твърд провал (вреди на доверието или нарушава правило) · ! бележка (липсва сигнал) · ✓ чисто.

import { isMain } from "../lib/is-main.mjs";

/** YMYL: там по QRG липсата на отговорно лице и контакт е „Lowest“ — затова проверките там са твърди. */
export const YMYL = new Set(["medqr.carbonstealth.eu", "ospedalitrasparenti.it", "zabobovdol.carbonstealth.eu"]);

// Организация или местен бизнес (вкл. подтиповете, които реално ползваме). Звезди върху тях са self-serving по Google.
const ORG_TYPE = /(?:Organization|Corporation|LocalBusiness|Business|Store|Shop|Restaurant|Establishment|Service|ExerciseGym|HealthClub|SportsActivityLocation|School|Contractor|Office|Clinic|Physician|Dentist|Pharmacy|Hotel|Cafe|Bakery|BarOrPub|NGO)$/;
const HSTS_MIN = 15552000; // 6 месеца — вътрешна политика, не изискване на Google.
const YEAR_MS = 366 * 24 * 3600 * 1000;

const PAGES = {
  "page-about": /за[\s-]?нас|za-?nas|\babout\b|chi[\s-]?siamo|who[\s-]?we[\s-]?are|\bazienda\b|наш(?:ия)?[\s-]екип|\bteam\b/i,
  "page-contact": /контакт|kontakt|\bcontact|contatt/i,
  "page-privacy": /поверителност|privacy|privatezza|лични[\s-]данни|lichni-danni|\bgdpr\b/i,
  "page-legal": /импресум|impressum|note[\s-]legali|правна[\s-]информация|данни[\s-]за[\s-](?:фирмата|дружеството)|\blegal\b|termini|\bterms\b|условия|uslovia/i,
};

const typesOf = (n) => [].concat(n?.["@type"] || []).map(String);

/** Всички възли с @type в JSON-LD (масиви, @graph, вложени обекти). */
function nodes(x, out = []) {
  if (Array.isArray(x)) { for (const v of x) nodes(v, out); return out; }
  if (!x || typeof x !== "object") return out;
  if (x["@type"]) out.push(x);
  for (const [k, v] of Object.entries(x)) if (k !== "@context" && v && typeof v === "object") nodes(v, out);
  return out;
}

/** JSON-LD блоковете: { ok: [обекти], broken: брой }. */
export function jsonLd(html) {
  const ok = [];
  let broken = 0;
  for (const m of String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { ok.push(JSON.parse(m[1])); } catch { broken++; }
  }
  return { ok, broken };
}

const visibleText = (html) => String(html || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
const digits = (s) => String(s || "").replace(/\D/g, "");

/** security.txt по RFC 9116: { ok, why }. */
export function parseSecurityTxt(sec, now = new Date()) {
  if (!sec || sec.status !== 200) return { ok: false, why: `липсва /.well-known/security.txt (${sec?.status ?? "няма отговор"})` };
  if (!/text\/plain/i.test(String(sec.contentType || ""))) return { ok: false, why: "security.txt не е text/plain" };
  const text = String(sec.text || "");
  if (!/^contact:\s*\S+/im.test(text)) return { ok: false, why: "security.txt без Contact" };
  const exp = /^expires:\s*(\S+)/im.exec(text);
  if (!exp) return { ok: false, why: "security.txt без Expires" };
  const t = Date.parse(exp[1]);
  if (!Number.isFinite(t)) return { ok: false, why: `Expires не е дата (${exp[1]})` };
  if (t <= now.getTime()) return { ok: false, why: `security.txt е изтекъл (${exp[1]})` };
  if (t - now.getTime() > YEAR_MS) return { ok: false, why: `Expires е над година напред (${exp[1]}) — RFC 9116 препоръчва под година` };
  return { ok: true, why: "" };
}

/** Анализ на един сайт. Чиста функция: { site, ymyl, checks: [{id, level, ok, msg}] }. */
export function analyze({ url, html = "", headers = {}, security = null, now = new Date() }) {
  const host = new URL(url).host;
  const ymyl = YMYL.has(host);
  const checks = [];
  const add = (id, level, ok, msg) => checks.push({ id, level, ok: Boolean(ok), msg });
  const { ok: blocks, broken } = jsonLd(html);
  const all = blocks.flatMap((b) => nodes(b));
  const orgs = all.filter((n) => typesOf(n).some((t) => ORG_TYPE.test(t)));
  const org = orgs.find((n) => n["@id"]) || orgs[0] || null;

  add("jsonld-valid", "твърда", broken === 0, broken ? `${broken} счупени JSON-LD блока — търсачката не вижда нищо от тях` : "");
  add("org", "твърда", Boolean(org), org ? "" : "няма Organization/LocalBusiness в JSON-LD — кой стои зад сайта не е машинно ясно");
  if (org) {
    const sameAs = [].concat(org.sameAs || []).map(String);
    const bad = sameAs.filter((s) => !/^https:\/\//.test(s));
    add("org-id", "бележка", Boolean(org["@id"]), org["@id"] ? "" : "организацията няма устойчив @id — продуктите не могат да сочат към един и същ субект");
    add("org-sameAs", "бележка", sameAs.length > 0 && !bad.length, !sameAs.length ? "няма sameAs — сложи само реално съществуващи профили (LinkedIn, GitHub, Google Business Profile…)" : bad.length ? `sameAs не е https: ${bad.join(", ")}` : "");
    add("org-logo", "бележка", Boolean(org.logo), org.logo ? "" : "няма logo (Google: поне 112×112, достъпно за обхождане)");
    const contact = org.contactPoint || org.email || org.telephone;
    add("org-contact", ymyl ? "твърда" : "бележка", Boolean(contact), contact ? "" : "няма контакт в схемата (email/telephone/contactPoint)");
    add("org-legal-ids", "бележка", Boolean(org.legalName || org.vatID || org.taxID), org.legalName || org.vatID || org.taxID ? "" : "няма legalName/vatID/taxID — регистрираното дружество не е машинно ясно");
  }
  const selfRated = orgs.filter((n) => n.aggregateRating || n.review);
  add("self-serving-rating", "твърда", !selfRated.length, selfRated.length ? `звезди (aggregateRating/review) върху ${selfRated.map((n) => typesOf(n).join("/")).join(", ")} — Google не ги позволява, когато бизнесът контролира отзивите; махни ги от схемата` : "");
  const otherRated = all.filter((n) => !orgs.includes(n) && (n.aggregateRating || n.review) && !typesOf(n).some((t) => /^(?:AggregateRating|Review|Rating)$/.test(t)));
  add("product-rating", "бележка", !otherRated.length, otherRated.length ? `звезди върху ${otherRated.map((n) => typesOf(n).join("/")).join(", ")} — само ако са от реални потребители и се виждат на страницата` : "");

  const links = [...String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`);
  for (const [id, re] of Object.entries(PAGES)) {
    const level = id === "page-contact" || id === "page-privacy" || (id === "page-about" && ymyl) ? "твърда" : "бележка";
    const ok = links.some((l) => re.test(l));
    add(id, level, ok, ok ? "" : `няма връзка към ${{ "page-about": "„За нас“", "page-contact": "контакт", "page-privacy": "политика за поверителност", "page-legal": "правна информация/импресум" }[id]} от началната страница`);
  }

  const hsts = String(headers["strict-transport-security"] || "");
  const maxAge = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
  add("hsts", "бележка", maxAge >= HSTS_MIN, maxAge >= HSTS_MIN ? "" : hsts ? `HSTS max-age=${maxAge} е под 6 месеца` : "няма Strict-Transport-Security");
  const sec = parseSecurityTxt(security, now);
  add("security-txt", "бележка", sec.ok, sec.why);

  if (org) {
    const text = visibleText(html).toLowerCase();
    const textDigits = digits(text);
    const misses = [];
    for (const e of [].concat(org.email || [])) if (!text.includes(String(e).toLowerCase())) misses.push(String(e));
    for (const p of [].concat(org.telephone || [])) if (digits(p).length >= 6 && !textDigits.includes(digits(p).slice(-8))) misses.push(String(p));
    add("nap", "бележка", !misses.length, misses.length ? `контактът от схемата не се вижда на страницата: ${misses.join(", ")}` : "");
  }
  return { site: url, ymyl, checks };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
async function get(url, ms = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", signal: c.signal, headers: { "user-agent": "CarbonStealth-trust-check/1.0" } });
    return { status: r.status, url: r.url, headers: Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])), text: await r.text() };
  } catch (e) { return { error: String(e?.cause?.code || e?.message || e) }; } finally { clearTimeout(t); }
}

async function checkSite(url) {
  const home = await get(url);
  if (home.error || home.status >= 400) return { site: url, error: home.error || `HTTP ${home.status}`, checks: [] };
  const s = await get(new URL("/.well-known/security.txt", home.url).href, 8000);
  return analyze({ url, html: home.text, headers: home.headers, security: s.error ? null : { status: s.status, contentType: s.headers["content-type"], text: s.text } });
}

async function main(argv) {
  const { SITES } = await import("./sites.mjs");
  const wanted = argv.filter((a) => !a.startsWith("--"));
  const urls = wanted.length ? wanted.map((w) => (/^https?:\/\//.test(w) ? w : `https://${w}`)) : SITES.map((s) => s.url);
  const results = await Promise.all(urls.map(checkSite));
  if (argv.includes("--json")) process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  else {
    for (const r of results) {
      const hard = r.checks.filter((c) => !c.ok && c.level === "твърда");
      const soft = r.checks.filter((c) => !c.ok && c.level === "бележка");
      const mark = r.error || hard.length ? "✘" : soft.length ? "!" : "✓";
      process.stdout.write(`${mark} ${r.site}${r.ymyl ? "  (YMYL)" : ""}\n`);
      if (r.error) process.stdout.write(`    ✘ не отговаря: ${r.error}\n`);
      for (const c of hard) process.stdout.write(`    ✘ ${c.id}: ${c.msg}\n`);
      for (const c of soft) process.stdout.write(`    ! ${c.id}: ${c.msg}\n`);
    }
    const bad = results.filter((r) => r.error || r.checks.some((c) => !c.ok && c.level === "твърда")).length;
    process.stdout.write(`\n${results.length} сайта · ✘ ${bad} с твърд провал · ✓ ${results.filter((r) => !r.error && r.checks.every((c) => c.ok)).length} чисти\n`);
  }
  if (argv.includes("--check") && results.some((r) => r.error || r.checks.some((c) => !c.ok && c.level === "твърда"))) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));
