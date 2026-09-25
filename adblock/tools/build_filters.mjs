// Билд на статичните рулсети от публичните листи (dev-only, не влиза в пакета).
//
//   node tools/build_filters.mjs [--local <dir>] [--out <dir>] [--report]
//
// Сваля EasyList + EasyPrivacy + URLhaus (или чете свалени копия от <dir>) и
// генерира:
//   rules/easylist.json        мрежови block/allow правила (DNR)
//   rules/easyprivacy.json     тракер block/allow правила (DNR)
//   rules/urlhaus.json         malware домейни (DNR, изключен по подразбиране)
//   rules/counts.json          брой правила по рулсет (за статистиката в UI)
//   cosmetic_generic.css       генерични козметични селектори (гейтнати с
//                              html[data-tbab-on], иначе би скривало и при OFF)
//   rules/cosmetic_specific.json  домейн-специфични селектори + unhide + procedural
//
// Компресия: чистите ||domain^ правила се сливат по сигнатура на опциите в
// малко на брой DNR правила с requestDomains масиви (както прави uBOL), така
// ~100k ABP реда се събират в бюджета от 30 000 статични правила на Chrome.
//
// Лицензи: EasyList/EasyPrivacy © The EasyList authors (GPLv3 / CC BY-SA 3.0),
// URLhaus (abuse.ch) е CC0. Виж docs/LICENSES.md.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, domainToASCII } from "node:url";
import { runInNewContext } from "node:vm";
import { genericCss } from "./generic_css.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = {
  easylist: "https://easylist.to/easylist/easylist.txt",
  easyprivacy: "https://easylist.to/easylist/easyprivacy.txt",
  urlhaus: "https://urlhaus.abuse.ch/downloads/hostfile/",
};

// Пътни (не-domain) правила: капове, за да останем в бюджета от 30k статични
// правила общо с ad_rules/youtube_rules/removeparam.
const PATTERN_CAP = { easylist: 15000, easyprivacy: 9000 };
const DOMAINS_PER_RULE = 1000; // requestDomains chunk на едно DNR правило

// Никога не блокираме core video/CDN домейни (счупват сайтове/видео). Списъкът е
// в scriptlets/policy.js (единствен източник — същият, който пази live канала и
// потребителските филтри); зареждаме го през vm като build_scriptlets.mjs.
const SA_POLICY = (() => {
  const ctx = {};
  runInNewContext(readFileSync(join(ROOT, "scriptlets", "policy.js"), "utf8"), ctx, { filename: "policy.js" });
  return ctx.SA_POLICY;
})();
if (!SA_POLICY || typeof SA_POLICY.protectedHost !== "function") { console.error("ERROR: scriptlets/policy.js did not define SA_POLICY"); process.exit(1); }
const isProtected = (d) => SA_POLICY.protectedHost(d);

// Converter (parse ABP/uBO lines → DNR rules + cosmetics) lives in lib/abp2dnr.js —
// shared with the service worker, loaded here through node:vm like policy.js.
const CONV = (() => {
  const ctx = { SA_POLICY, domainToASCII, URL, console };
  runInNewContext(readFileSync(join(ROOT, "lib", "abp2dnr.js"), "utf8"), ctx, { filename: "abp2dnr.js" });
  return ctx.ABP2DNR;
})();
const { convertCosmetic, collectGenericHide, badfiltersOf, preprocess, hostsToAbp, validDomain, SKIP_REASONS } = CONV;
const POPUP_HOSTS = new Set();
const BADFILTER = new Set();
const convertList = (text, key, popups = true) =>
  CONV.convertList(text, key, { cap: PATTERN_CAP[key] ?? Infinity, badfilter: BADFILTER, popups: popups ? POPUP_HOSTS : null });

// --- main --------------------------------------------------------------------
const localDir = process.argv.includes("--local")
  ? process.argv[process.argv.indexOf("--local") + 1]
  : null;
// --out <dir>: пиши генерираните файлове там вместо в репото (тестовете пускат
// конвертора наистина, върху фикстури, без да пипат rules/). Четенията
// (policy.js, ръчните рулсети за counts) остават от репото.
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : ROOT;
mkdirSync(join(OUT, "rules"), { recursive: true });
mkdirSync(join(OUT, "scriptlets"), { recursive: true });

async function getText(key) {
  if (localDir) {
    const p = join(localDir, key + ".txt");
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  const res = await fetch(SOURCES[key]);
  if (!res.ok) throw new Error(key + ": HTTP " + res.status);
  return res.text();
}

async function fetchText(url, depth = 0) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ": HTTP " + res.status);
  let text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error(url + ": HTML instead of a filter list");
  // `!#include file` — само относителен път на същия хост (така прави и uBO).
  if (depth < 2 && text.includes("!#include ")) {
    const parts = [];
    for (const line of text.split("\n")) {
      const m = /^!#include\s+(\S+)\s*$/.exec(line.trim());
      if (!m || /^[a-z]+:/i.test(m[1]) || m[1].includes("..")) { parts.push(line); continue; }
      const inc = new URL(m[1], url);
      // `//other.host/x` or `\\other.host` resolve to ANOTHER host — whose licence we never checked
      if (inc.origin !== new URL(url).origin) { parts.push(line); continue; }
      parts.push(await fetchText(inc.href, depth + 1));
    }
    text = parts.join("\n");
  }
  return text;
}

async function listText(entry) {
  // Built-in Focus items: a few selectors of our own (MIT), no download.
  if (entry.selectors) return entry.selectors.map((x) => "##" + x).join("\n");
  if (localDir) {
    const p = join(localDir, entry.id + ".txt");
    return existsSync(p) ? readFileSync(p, "utf-8") : null; // тестове: без мрежа
  }
  const texts = [];
  for (const u of entry.urls) texts.push(await fetchText(u));
  return preprocess(texts.join("\n"));
}

const [el, ep, uh] = await Promise.all([getText("easylist"), getText("easyprivacy"), getText("urlhaus")]);
// Текстовете на листите от каталога — предварително, за да важат $badfilter-ите
// на основните листи (uBO) и за EasyList/EasyPrivacy.
const CATALOG_TEXT = new Map();
const CATALOG_ERR = new Map();
{
  const catalog = JSON.parse(readFileSync(join(ROOT, "tools", "lists.json"), "utf8")).lists;
  await Promise.all(catalog.filter((e) => e.delivery === "bundled").map(async (e) => {
    try { CATALOG_TEXT.set(e.id, await listText(e)); } catch (err) { CATALOG_ERR.set(e.id, err.message); }
  }));
  for (const t of [el, ep, ...catalog.filter((e) => e.group === "core").map((e) => CATALOG_TEXT.get(e.id) || "")])
    for (const b of badfiltersOf(t)) BADFILTER.add(b);
  console.log(`badfilter: ${BADFILTER.size} реда от основните листи`);
}

const counts = {};

for (const [key, text] of [["easylist", el], ["easyprivacy", ep]]) {
  const { rules, skipped } = convertList(text, key);
  writeFileSync(join(OUT, "rules", key + ".json"), JSON.stringify(rules));
  counts[key] = rules.length;
  console.log(`${key}: ${rules.length} DNR правила (пропуснати ${skipped} несъвместими реда)`);
}

// URLhaus hostfile: "127.0.0.1 domain" редове.
{
  const domains = [...new Set(
    uh.split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/).pop().toLowerCase())
      .filter((d) => validDomain(d) && !isProtected(d))
  )].sort();
  const rules = [];
  for (let i = 0; i < domains.length; i += DOMAINS_PER_RULE) {
    rules.push({
      id: rules.length + 1,
      priority: 1,
      action: { type: "block" },
      condition: { requestDomains: domains.slice(i, i + DOMAINS_PER_RULE) },
    });
  }
  writeFileSync(join(OUT, "rules", "urlhaus.json"), JSON.stringify(rules));
  counts.urlhaus = domains.length;
  console.log(`urlhaus: ${domains.length} malware домейна в ${rules.length} правила`);
}

// Козметика (EasyList; EasyPrivacy е с пренебрежима козметика, добавяме и нея).
{
  const a = convertCosmetic(el);
  const b = convertCosmetic(ep);
  for (const s of b.generic) a.generic.add(s);
  for (const [d, set] of b.specific) {
    if (!a.specific.has(d)) a.specific.set(d, new Set());
    for (const s of set) a.specific.get(d).add(s);
  }

  const gen = [...a.generic].sort();
  writeFileSync(join(OUT, "cosmetic_generic.css"), genericCss(gen));

  const specObj = {};
  for (const d of [...a.specific.keys()].sort()) specObj[d] = [...a.specific.get(d)].sort();
  const unhideObj = {};
  for (const d of [...a.unhide.keys()].sort()) unhideObj[d] = [...a.unhide.get(d)].sort();
  const ghide = new Set([...collectGenericHide(el), ...collectGenericHide(ep)]);
  const genericHide = [...ghide].sort();
  writeFileSync(
    join(OUT, "rules", "cosmetic_specific.json"),
    JSON.stringify({ specific: specObj, unhide: unhideObj, genericHide })
  );
  counts.cosmeticGeneric = gen.length;
  counts.cosmeticSpecific = Object.values(specObj).reduce((n, v) => n + v.length, 0);
  counts.genericHide = genericHide.length;
  console.log(`козметика: ${gen.length} генерични, ${counts.cosmeticSpecific} домейн-специфични, unhide за ${Object.keys(unhideObj).length} домейна, generichide за ${genericHide.length} домейна`);
}

// --- Допълнителни листи (tools/lists.json) -----------------------------------
// bundled → статичен DNR рулсет rules/list_<id>.json + козметика rules/cosmetic_<id>.json
// (генеричен CSS като индексируем вложен блок, домейн-специфични, #@#, generichide);
// remote → нищо не се пакетира: браузърът на потребителя сваля листа от автора,
// когато той го включи (лист без лиценз за разпространение). rules/lists.json е
// каталогът за UI и service worker-а; manifest.json се синхронизира с рулсетовете.
const CATALOG = JSON.parse(readFileSync(join(ROOT, "tools", "lists.json"), "utf8")).lists;
const LIST_PATTERN_CAP = 12000;

const listCatalog = [];
const manifestRulesets = [];
for (const entry of CATALOG) {
  const meta = {
    id: entry.id, group: entry.group, default: entry.default, delivery: entry.delivery,
    langs: entry.langs || [], title: entry.title, license: entry.license, homepage: entry.homepage,
  };
  if (entry.delivery === "remote") {
    meta.url = entry.urls[0];
    meta.slot = entry.slot; // fixed dynamic-rule slot: never reuse one for another list
    listCatalog.push(meta);
    continue;
  }
  if (CATALOG_ERR.has(entry.id)) { console.warn(`${entry.id}: пропуснат — ${CATALOG_ERR.get(entry.id)}`); continue; }
  let text = CATALOG_TEXT.get(entry.id);
  if (text == null) continue;
  const ownBad = entry.group === "core" ? [] : badfiltersOf(text).filter((b) => !BADFILTER.has(b));
  for (const b of ownBad) BADFILTER.add(b);
  if (entry.format === "hosts") text = hostsToAbp(text);
  PATTERN_CAP["list_" + entry.id] = LIST_PATTERN_CAP;
  const { rules, skipped } = convertList(text, "list_" + entry.id, entry.group === "core");
  for (const b of ownBad) BADFILTER.delete(b);
  // A list with no network rules (built-in selectors) gets no ruleset at all.
  meta.ruleset = rules.length > 0;
  if (meta.ruleset) writeFileSync(join(OUT, "rules", `list_${entry.id}.json`), JSON.stringify(rules));
  const cos = convertCosmetic(text);
  const spec = {}, unh = {};
  for (const d of [...cos.specific.keys()].sort()) spec[d] = [...cos.specific.get(d)].sort();
  for (const d of [...cos.unhide.keys()].sort()) unh[d] = [...cos.unhide.get(d)].sort();
  const gen = [...cos.generic].sort();
  writeFileSync(join(OUT, "rules", `cosmetic_${entry.id}.json`), JSON.stringify({
    css: gen.length ? genericCss(gen) : "",
    specific: spec, unhide: unh, genericHide: [...collectGenericHide(text)].sort(),
  }));
  // uBO scriptlets (`host##+js(...)`) → scriptlets/list_ubo.txt: DATA for
  // build_scriptlets.mjs, which validates every name/argument like list.txt and
  // bakes them into scriptlets/main_ubo.js (registered only on those hosts).
  // Global directives and `#@#+js` exceptions are left out: a global one would
  // have to run on every site, and an exception must cancel its host's entry.
  if (entry.id === "ubo") {
    const js = [], exc = new Set();
    for (let line of text.split("\n")) {
      line = line.trim();
      const e = line.indexOf("#@#+js(");
      if (e > 0) { for (const h of line.slice(0, e).split(",")) exc.add(h.trim().toLowerCase() + "\u0000" + line.slice(e + 3)); continue; }
      const i = line.indexOf("##+js(");
      if (i <= 0 || line.startsWith("!")) continue;
      const hosts = line.slice(0, i).split(",").map((h) => h.trim().toLowerCase())
        .filter((h) => h && !exc.has(h + "\u0000" + line.slice(i + 2)));
      if (hosts.length) js.push(hosts.join(",") + line.slice(i));
    }
    const kept = js.filter((l) => { const i = l.indexOf("##+js("); return !l.slice(0, i).split(",").some((h) => exc.has(h + "\u0000" + l.slice(i + 2))); });
    writeFileSync(join(OUT, "scriptlets", "list_ubo.txt"),
      "! GENERATED by tools/build_filters.mjs from the uBlock Origin filters (GPL-3.0) — DATA, not code.\n" + [...new Set(kept)].join("\n") + "\n");
    console.log(`ubo scriptlets: ${kept.length} директиви → scriptlets/list_ubo.txt`);
  }
  meta.network = rules.length;
  meta.cosmetic = gen.length + Object.values(spec).reduce((n, v) => n + v.length, 0);
  listCatalog.push(meta);
  if (meta.ruleset) manifestRulesets.push({ id: "list_" + entry.id, enabled: false, path: `rules/list_${entry.id}.json` });
  counts["list_" + entry.id] = rules.length;
  console.log(`${entry.id}: ${rules.length} DNR правила, ${meta.cosmetic} козметични (пропуснати ${skipped})`);
}
writeFileSync(join(OUT, "rules", "lists.json"), JSON.stringify(listCatalog, null, 1) + "\n");

// THIRD_PARTY_NOTICES.txt (ships in the package): attribution + licence of every
// list whose rules we redistribute — CC BY-SA / GPL / MIT / MPL ask for it.
if (OUT === ROOT) {
  const bundled = CATALOG.filter((e) => e.delivery === "bundled" && !e.selectors);
  const lines = [
    "Supreme AdBlock — third-party filter lists",
    "",
    "The extension's rules are compiled from these lists (converted to Chrome's",
    "declarativeNetRequest format and CSS; content otherwise unchanged). Each list",
    "keeps its own licence; the extension's code is MIT (see LICENSE).",
    "",
    "EasyList, EasyPrivacy — © The EasyList authors — GPL-3.0 or CC BY-SA 3.0 — https://easylist.to/",
    "URLhaus (abuse.ch) — CC0 — https://urlhaus.abuse.ch/",
    ...bundled.map((e) => `${e.title} — ${e.license} — ${e.homepage}`),
    "",
    "Not bundled (downloaded from their author only when you turn them on):",
    ...CATALOG.filter((e) => e.delivery === "remote").map((e) => `${e.title} — ${e.license} — ${e.homepage}`),
    "",
  ];
  writeFileSync(join(ROOT, "THIRD_PARTY_NOTICES.txt"), lines.join("\n"));
}

// manifest.json: рулсетовете на листите са НАШ изход — синхронизираме ги (само в
// репото; тестовете с --out не пипат manifest-а). Ръчните рулсети остават първи.
if (OUT === ROOT) {
  const mp = join(ROOT, "manifest.json");
  const man = JSON.parse(readFileSync(mp, "utf8"));
  const rr = man.declarative_net_request.rule_resources.filter((r) => !r.id.startsWith("list_"));
  man.declarative_net_request.rule_resources = rr.concat(manifestRulesets);
  writeFileSync(mp, JSON.stringify(man, null, 2) + "\n");
}

// Броим и ръчно поддържаните рулсети, за да е пълна статистиката в UI.
for (const f of ["ad_rules", "youtube_rules", "removeparam", "surrogates", "headers", "privacy"]) {
  const p = join(ROOT, "rules", f + ".json");
  if (existsSync(p)) counts[f] = JSON.parse(readFileSync(p, "utf-8")).length;
}
const popupHosts = [...POPUP_HOSTS].sort();
writeFileSync(join(OUT, "rules", "popup_hosts.json"), JSON.stringify(popupHosts) + "\n");
counts.popupHosts = popupHosts.length; // before counts.json is written (health card reads it)
console.log(`popup hosts (baked window.open guard): ${popupHosts.length}`);
counts.generated = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT, "rules", "counts.json"), JSON.stringify(counts, null, 2) + "\n");
if (process.argv.includes("--report")) {
  console.log("skip reasons (top 30):", JSON.stringify(Object.entries(SKIP_REASONS).sort((a, b) => b[1] - a[1]).slice(0, 30)));
}
console.log("counts.json:", JSON.stringify(counts));
