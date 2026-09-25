// Локализация: всеки locale има точно ключовете на en (без празни съобщения, с
// паритет на placeholder-ите); всеки data-i18n ключ в popup/options и всеки t("…")
// ключ в JS съществува в en. Половин превод никога не бланкира UI (i18n.js пази
// английския текст при липсващ ключ), но CI не пуска дупки.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const locales = readdirSync(join(ROOT, "_locales")).sort();
const msgs = Object.fromEntries(locales.map((l) => [l, JSON.parse(read("_locales", l, "messages.json"))]));
const en = msgs.en;
const enKeys = Object.keys(en).sort();
ok("locales present: en + bg + it + de", ["bg", "de", "en", "it"].every((l) => locales.includes(l)));
for (const l of locales) {
  const keys = Object.keys(msgs[l]).sort();
  ok(`${l}: same key set as en (${keys.length})`, keys.join("|") === enKeys.join("|"));
  ok(`${l}: no empty messages`, keys.every((k) => typeof msgs[l][k].message === "string" && msgs[l][k].message.trim().length > 0));
  ok(`${l}: placeholder parity with en`, keys.every((k) => {
    const a = (en[k].message.match(/\$\d/g) || []).sort().join(), b = (msgs[l][k].message.match(/\$\d/g) || []).sort().join();
    return a === b;
  }));
}

const html = read("popup", "popup.html") + read("options", "options.html");
const used = new Set([...html.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)].map((m) => m[1]));
const js = read("popup", "popup.js") + read("options", "options.js");
for (const m of js.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)) used.add(m[1]);
const missing = [...used].filter((k) => !(k in en));
ok(`every key used in markup/JS exists in en (${used.size} used; missing: ${missing.join(",") || "none"})`, missing.length === 0);
ok("manifest name/description are localised via __MSG__", /__MSG_extName__|"Supreme AdBlock"/.test(read("manifest.json")));

// popup.js keeps an English FALLBACK table (for a locale that misses a key) — it must
// never drift from en, otherwise the "fallback" silently becomes a second source.
const fbMatch = /const FALLBACK = (\{[\s\S]*?\n\});/.exec(read("popup", "popup.js"));
const FALLBACK = fbMatch ? runInNewContext("(" + fbMatch[1] + ")") : null;
ok("popup.js FALLBACK table found", !!FALLBACK && Object.keys(FALLBACK).length > 0);
const drift = Object.keys(FALLBACK || {}).filter((k) => !(k in en) || en[k].message !== FALLBACK[k]);
ok(`popup.js FALLBACK == en for every key (drift: ${drift.join(",") || "none"})`, drift.length === 0);

// Every locale (70 languages): same keys as en, every $n placeholder kept, the
// store limits, the brand name untouched, and a store description per language.
{
  const { readdirSync, existsSync } = await import("node:fs");
  const locales = readdirSync(join(ROOT, "_locales")).filter((l) => l !== "en");
  const langs = new Set(locales.map((l) => l.split("_")[0]).concat("en"));
  ok(`at least 54 languages (${langs.size} languages, ${locales.length + 1} locale folders)`, langs.size >= 54);
  const bullets = (t) => (t.match(/•/g) || []).length;
  const enListing = existsSync(join(ROOT, "docs", "listing", "en.txt")) ? read("docs", "listing", "en.txt") : "";
  const bad = [];
  for (const L of locales) {
    let d;
    try { d = JSON.parse(read("_locales", L, "messages.json")); } catch (e) { bad.push(`${L}: invalid JSON`); continue; }
    const missingK = Object.keys(en).filter((k) => !d[k] || typeof d[k].message !== "string" || !d[k].message.trim());
    const extra = Object.keys(d).filter((k) => !(k in en));
    if (missingK.length) bad.push(`${L}: missing ${missingK.slice(0, 5).join(",")}`);
    if (extra.length) bad.push(`${L}: unknown keys ${extra.slice(0, 5).join(",")}`);
    for (const k of Object.keys(en)) {
      if (!d[k]) continue;
      for (const ph of en[k].message.match(/\$\d|\$[A-Z_]+\$/g) || []) {
        if (d[k].message.split(ph).length !== en[k].message.split(ph).length) bad.push(`${L}: ${k} placeholder ${ph}`);
      }
      if (en[k].placeholders && JSON.stringify(d[k].placeholders) !== JSON.stringify(en[k].placeholders)) bad.push(`${L}: ${k} placeholders object`);
    }
    if (d.extName && d.extName.message !== "Supreme AdBlock") bad.push(`${L}: extName translated`);
    if (d.extDescription && d.extDescription.message.length > 132) bad.push(`${L}: extDescription ${d.extDescription.message.length} > 132`);
    const lp = join(ROOT, "docs", "listing", L + ".txt");
    if (!existsSync(lp)) bad.push(`${L}: no docs/listing/${L}.txt`);
    else if (bullets(read("docs", "listing", L + ".txt")) !== bullets(enListing)) bad.push(`${L}: store description bullets`);
  }
  ok(`every locale complete and consistent with en (${bad.length ? bad.slice(0, 8).join(" | ") : "ok"})`, bad.length === 0);
}

done();
