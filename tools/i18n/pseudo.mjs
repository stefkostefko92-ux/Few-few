#!/usr/bin/env node
// pseudo.mjs — псевдолокализация на JSON locale (Преводач агент v2.0).
// Удължава низовете ~+35% и ги маркира, за да хванеш отрязан текст/overflow в UI
// (италианският е ~+20% по-дълъг от английския) и твърдо кодирани (непреведени) низове.
//
// Употреба:  node tools/i18n/pseudo.mjs en.json > pseudo.json
import fs from "node:fs";
const file = process.argv[2];
if (!file) { console.error("Употреба: node pseudo.mjs <locale.json> > pseudo.json"); process.exit(2); }

const MAP = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", n: "ñ", c: "ç" };
const pseudo = (s) => {
  const inner = [...s].map((ch) => MAP[ch] || ch).join("");
  const pad = "~".repeat(Math.ceil(inner.replace(/\{[^}]*\}/g, "").length * 0.35));
  return `⟦${inner} ${pad}⟧`;
};
// Не пипай ICU/интерполация плейсхолдъри: {name}, {count, plural, ...}, %s, {{x}}
const transform = (v) => {
  if (typeof v === "string") {
    const parts = v.split(/(\{[^}]*\}|\{\{[^}]*\}\}|%[sd])/g);
    return parts.map((p) => (/^(\{|%)/.test(p) ? p : p ? pseudo(p) : p)).join("");
  }
  if (Array.isArray(v)) return v.map(transform);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, transform(x)]));
  return v;
};

try {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(JSON.stringify(transform(data), null, 2) + "\n");
  console.error("✔ Псевдолокализирано. Зареди го в UI и виж къде се чупи/реже текстът, и кои низове са останали латиница (= твърдо кодирани/непреведени).");
} catch (e) { console.error("✘", e.message); process.exit(1); }
