#!/usr/bin/env node
// check-jsonld.mjs — извлича и валидира JSON-LD от страница/файл (SEO агент v2.0).
// Хваща счупена схема (= загубени богати резултати + AI цитирания) и докладва
// типовете. Не заменя Rich Results Test, но е бърз CI гейт.
//
// Употреба:
//   node tools/seo/check-jsonld.mjs https://zabobovdol.carbonstealth.eu
//   node tools/seo/check-jsonld.mjs path/to/page.html
import fs from "node:fs";

const arg = process.argv[2];
if (!arg) { console.error("Употреба: node check-jsonld.mjs <url|file.html>"); process.exit(2); }

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src, { headers: { "user-agent": "jsonld-check/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }
  return fs.readFileSync(src, "utf8");
}

const RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

try {
  const html = await load(arg);
  const blocks = [...html.matchAll(RE)].map((m) => m[1].trim());
  if (!blocks.length) { console.log("⚠ Няма JSON-LD блокове намерени."); process.exit(1); }

  console.log(`Намерени ${blocks.length} JSON-LD блока в ${arg}\n`);
  let bad = 0;
  const types = new Set();
  blocks.forEach((b, i) => {
    try {
      const data = JSON.parse(b);
      const collect = (n) => {
        if (Array.isArray(n)) return n.forEach(collect);
        if (n && typeof n === "object") {
          if (n["@type"]) [].concat(n["@type"]).forEach((t) => types.add(t));
          if (n["@graph"]) collect(n["@graph"]);
        }
      };
      collect(data);
      console.log(`  #${i + 1} ✔ валиден JSON`);
    } catch (e) {
      bad++; console.log(`  #${i + 1} ✘ СЧУПЕН JSON: ${e.message}`);
    }
  });
  console.log(`\nТипове: ${[...types].sort().join(", ") || "(няма @type)"}`);
  // Леки евристики
  if (!types.has("Organization")) console.log("⚠ Липсва Organization (+ sameAs/knowsAbout) — най-силният лост за AI цитиране.");
  if (!types.has("BreadcrumbList")) console.log("⚠ Липсва BreadcrumbList.");
  if (types.has("FAQPage")) console.log("ℹ FAQPage: rich results са премахнати (7 май 2026) — пази само ако помага на AI разбирането.");
  if (bad) { console.log(`\n✘ ${bad} счупени блока.`); process.exit(1); }
  console.log("\n✔ Всички блокове са валиден JSON. (Провери eligibility и в Rich Results Test.)");
} catch (e) { console.error("✘", e.message); process.exit(1); }
