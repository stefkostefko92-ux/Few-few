// Локализация: всеки locale има точно ключовете на en (без празни съобщения, с
// паритет на placeholder-ите); всеки data-i18n ключ в popup/options и всеки t("…")
// ключ в JS съществува в en. Половин превод никога не бланкира UI (i18n.js пази
// английския текст при липсващ ключ), но CI не пуска дупки.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

done();
