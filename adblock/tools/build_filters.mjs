// Билд на статичните рулсети от публичните листи (dev-only, не влиза в пакета).
//
//   node tools/build_filters.mjs [--local <dir>]
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

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Никога не блокираме core video/CDN домейни (счупват сайтове/видео).
const NEVER_BLOCK = [
  "googlevideo.com", "ytimg.com", "youtube.com", "ggpht.com", "gstatic.com",
  "googleapis.com", "google.com", "fbcdn.net", "cdninstagram.com",
];
const isProtected = (d) => NEVER_BLOCK.some((p) => d === p || d.endsWith("." + p));

const TYPE_MAP = {
  script: "script", image: "image", stylesheet: "stylesheet", object: "object",
  xmlhttprequest: "xmlhttprequest", xhr: "xmlhttprequest",
  subdocument: "sub_frame", frame: "sub_frame", ping: "ping",
  websocket: "websocket", media: "media", font: "font", other: "other",
};

// Опции, при които правилото се пропуска (не се превеждат към DNR).
const SKIP_OPTS = new Set([
  "popup", "generichide", "elemhide", "ghide", "ehide", "genericblock",
  "rewrite", "redirect", "redirect-rule", "csp", "removeparam", "replace",
  "header", "cookie", "cname", "denyallow", "strict1p", "strict3p",
  "inline-script", "inline-font", "mp4", "empty", "webrtc", "object-subrequest",
  "badfilter", "all", "urlskip", "ipaddress", "method", "to", "from", "permissions",
]);

const isAscii = (s) => /^[\x20-\x7e]+$/.test(s);
const validDomain = (d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

// --- ABP мрежов ред -> междинно представяне -------------------------------
function parseNetLine(line) {
  let allow = false;
  if (line.startsWith("@@")) { allow = true; line = line.slice(2); }
  let pattern = line;
  let optStr = "";
  const di = line.lastIndexOf("$");
  // "$" в URL шаблон е рядкост; опциите винаги са след последния "$".
  if (di >= 0) {
    const tail = line.slice(di + 1);
    if (/^[a-z~][a-z0-9-~,=.|*:]*$/i.test(tail)) {
      pattern = line.slice(0, di);
      optStr = tail;
    } else if (/[\s'"]/.test(tail)) {
      return null; // $csp= и подобни със стойности с интервали/кавички — несъвместими
    }
  }
  if (!pattern || !isAscii(pattern)) return null;
  if (pattern.startsWith("/") && pattern.endsWith("/")) return null; // regex

  const o = {
    allow, pattern, important: false, matchCase: false, party: null,
    types: [], notTypes: [], initiator: [], notInitiator: [], doc: false,
  };
  if (optStr) {
    for (const raw of optStr.split(",")) {
      const neg = raw.startsWith("~");
      const t = neg ? raw.slice(1) : raw;
      const [name, val] = t.split("=");
      if (name === "third-party" || name === "3p") { o.party = neg ? "firstParty" : "thirdParty"; continue; }
      if (name === "first-party" || name === "1p") { o.party = neg ? "thirdParty" : "firstParty"; continue; }
      if (name === "important") { o.important = true; continue; }
      if (name === "match-case") { o.matchCase = true; continue; }
      if (name === "document" || name === "doc") { if (neg) return null; o.doc = true; continue; }
      if (name === "domain") {
        for (const d of (val || "").toLowerCase().split("|")) {
          const dn = d.startsWith("~") ? d.slice(1) : d;
          if (!validDomain(dn)) continue; // wildcard TLD и др. — пропускаме записа
          (d.startsWith("~") ? o.notInitiator : o.initiator).push(dn);
        }
        continue;
      }
      if (TYPE_MAP[name]) { (neg ? o.notTypes : o.types).push(TYPE_MAP[name]); continue; }
      if (SKIP_OPTS.has(name)) return null;
      return null; // непозната опция — по-безопасно е да пропуснем реда
    }
  }
  // Смесени положителни+отрицателни domain= пазят от чупене на сайтове —
  // не ги апроксимираме, пропускаме реда.
  if (o.initiator.length && o.notInitiator.length) return null;
  if (o.types.length && o.notTypes.length) o.notTypes = [];
  return o;
}

// Чист ||domain^ (или ||domain/) шаблон -> домейн за сливане, иначе null.
function pureDomain(pattern) {
  const m = /^\|\|([a-z0-9.-]+)[\^/]?$/.exec(pattern.toLowerCase());
  return m && validDomain(m[1]) ? m[1] : null;
}

function conditionFor(o) {
  const c = {};
  if (o.party) c.domainType = o.party;
  if (o.types.length) c.resourceTypes = [...new Set(o.types)].sort();
  else if (o.notTypes.length) c.excludedResourceTypes = [...new Set(o.notTypes)].sort();
  if (o.initiator.length) c.initiatorDomains = [...new Set(o.initiator)].sort();
  if (o.notInitiator.length) c.excludedInitiatorDomains = [...new Set(o.notInitiator)].sort();
  if (o.matchCase) c.isUrlFilterCaseSensitive = true;
  return c;
}

const priorityFor = (o) =>
  o.doc && o.allow ? 4 : o.important ? (o.allow ? 4 : 3) : o.allow ? 2 : 1;

function convertList(text, key) {
  const merge = new Map(); // сигнатура -> {proto, domains:Set}
  const pattern = [];
  let skipped = 0;

  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    if (line.includes("##") || line.includes("#@#") || line.includes("#?#") || line.includes("#$#")) continue;
    const o = parseNetLine(line);
    if (!o) { skipped++; continue; }

    const d = pureDomain(o.pattern);
    if (d) {
      if (!o.allow && isProtected(d)) continue;
      const sig = JSON.stringify([o.allow, o.doc, o.important, o.party, o.types.sort(), o.notTypes.sort(), o.initiator.sort(), o.notInitiator.sort()]);
      if (!merge.has(sig)) merge.set(sig, { proto: o, domains: new Set() });
      merge.get(sig).domains.add(d);
    } else {
      if (!o.allow && NEVER_BLOCK.some((p) => o.pattern.includes(p))) continue;
      pattern.push(o);
    }
  }

  const rules = [];
  let id = 1;

  // 1) Слети domain правила (стабилен ред: по сигнатура, домейните сортирани).
  for (const sig of [...merge.keys()].sort()) {
    const { proto, domains } = merge.get(sig);
    const all = [...domains].sort();
    for (let i = 0; i < all.length; i += DOMAINS_PER_RULE) {
      const c = conditionFor(proto);
      c.requestDomains = all.slice(i, i + DOMAINS_PER_RULE);
      if (proto.doc && proto.allow) c.resourceTypes = ["main_frame", "sub_frame"];
      rules.push({
        id: id++,
        priority: priorityFor(proto),
        action: { type: proto.doc && proto.allow ? "allowAllRequests" : proto.allow ? "allow" : "block" },
        condition: c,
      });
    }
  }

  // 2) Пътни/шаблонни правила, изключенията винаги влизат, block до капа.
  const cap = PATTERN_CAP[key] ?? Infinity;
  let blocks = 0;
  for (const o of pattern) {
    if (!o.allow && blocks >= cap) { skipped++; continue; }
    let uf = o.pattern.replace(/^\*+/, "").replace(/\*+$/, "");
    if (o.pattern.endsWith("|")) uf += "|";
    if (uf.length < 3) { skipped++; continue; }
    const c = conditionFor(o);
    c.urlFilter = uf;
    if (o.doc && o.allow) c.resourceTypes = ["main_frame", "sub_frame"];
    rules.push({
      id: id++,
      priority: priorityFor(o),
      action: { type: o.doc && o.allow ? "allowAllRequests" : o.allow ? "allow" : "block" },
      condition: c,
    });
    if (!o.allow) blocks++;
  }

  return { rules, skipped };
}

// --- Козметика --------------------------------------------------------------
// Селектор, безопасен за вграждане в CSS файла/JSON (никакво изпълнимо съдържание).
const BROAD = new Set(["*", "html", "body", ":root", "head", "div", "span", "a", "img", "main", "section", "article", "video", "iframe"]);
const cssSafe = (s) =>
  s.length >= 3 && s.length < 400 && !/[{}@]/.test(s) && !BROAD.has(s.toLowerCase());

// Процедурни оператори, които content.js engine-ът разбира.
const PROC_OK = /:(has-text|matches-css|upward|xpath|min-text-length|remove)\(/;

function convertCosmetic(text) {
  const generic = new Set();
  const specific = new Map(); // domain -> Set(selector)
  const unhide = new Map();
  const addTo = (map, domain, sel) => {
    if (!map.has(domain)) map.set(domain, new Set());
    map.get(domain).add(sel);
  };

  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    let sep, target;
    if (line.includes("#@#")) { sep = "#@#"; target = "unhide"; }
    else if (line.includes("#?#")) { sep = "#?#"; target = "proc"; }
    else if (line.includes("##")) { sep = "##"; target = "hide"; }
    else continue;
    const i = line.indexOf(sep);
    const domPart = line.slice(0, i);
    const sel = line.slice(i + sep.length).trim();
    if (!cssSafe(sel) || !isAscii(sel)) continue;
    if (target === "proc" && !PROC_OK.test(sel)) continue;
    if (sel.includes("+js(") || sel.includes("#$#")) continue;

    const domains = domPart
      ? domPart.toLowerCase().split(",").map((d) => d.trim())
      : [];
    if (!domains.length) {
      if (target === "hide") generic.add(sel);
      continue; // генерични unhide/procedural — пропускаме (пренебрежимо малко)
    }
    for (const d of domains) {
      const neg = d.startsWith("~");
      const dn = neg ? d.slice(1) : d;
      if (!validDomain(dn)) continue;
      if (neg) continue; // ~domain изключения при козметика — пропускаме реда за този домейн
      addTo(target === "unhide" ? unhide : specific, dn, sel);
    }
  }
  return { generic, specific, unhide };
}

// --- main --------------------------------------------------------------------
const localDir = process.argv.includes("--local")
  ? process.argv[process.argv.indexOf("--local") + 1]
  : null;

async function getText(key) {
  if (localDir) {
    const p = join(localDir, key + ".txt");
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  const res = await fetch(SOURCES[key]);
  if (!res.ok) throw new Error(key + ": HTTP " + res.status);
  return res.text();
}

const [el, ep, uh] = await Promise.all([getText("easylist"), getText("easyprivacy"), getText("urlhaus")]);

const counts = {};

for (const [key, text] of [["easylist", el], ["easyprivacy", ep]]) {
  const { rules, skipped } = convertList(text, key);
  writeFileSync(join(ROOT, "rules", key + ".json"), JSON.stringify(rules));
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
  writeFileSync(join(ROOT, "rules", "urlhaus.json"), JSON.stringify(rules));
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

  // Генеричен CSS, гейтнат зад html[data-tbab-on] (content.js слага атрибута
  // само при включена защита), на :is() чънкове — forgiving list, така един
  // невалиден селектор не чупи целия чънк.
  const gen = [...a.generic].sort();
  const CHUNK = 500;
  let css = "/* Generated by tools/build_filters.mjs - EasyList generic cosmetic rules */\n";
  for (let i = 0; i < gen.length; i += CHUNK) {
    css += "html[data-tbab-on] :is(" + gen.slice(i, i + CHUNK).join(",\n") + "){display:none!important}\n";
  }
  writeFileSync(join(ROOT, "cosmetic_generic.css"), css);

  const specObj = {};
  for (const d of [...a.specific.keys()].sort()) specObj[d] = [...a.specific.get(d)].sort();
  const unhideObj = {};
  for (const d of [...a.unhide.keys()].sort()) unhideObj[d] = [...a.unhide.get(d)].sort();
  writeFileSync(
    join(ROOT, "rules", "cosmetic_specific.json"),
    JSON.stringify({ specific: specObj, unhide: unhideObj })
  );
  counts.cosmeticGeneric = gen.length;
  counts.cosmeticSpecific = Object.values(specObj).reduce((n, v) => n + v.length, 0);
  console.log(`козметика: ${gen.length} генерични, ${counts.cosmeticSpecific} домейн-специфични, unhide за ${Object.keys(unhideObj).length} домейна`);
}

// Броим и ръчно поддържаните рулсети, за да е пълна статистиката в UI.
for (const f of ["ad_rules", "youtube_rules", "removeparam"]) {
  const p = join(ROOT, "rules", f + ".json");
  if (existsSync(p)) counts[f] = JSON.parse(readFileSync(p, "utf-8")).length;
}
counts.generated = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, "rules", "counts.json"), JSON.stringify(counts, null, 2) + "\n");
console.log("counts.json:", JSON.stringify(counts));
