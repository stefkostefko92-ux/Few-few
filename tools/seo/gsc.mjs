#!/usr/bin/env node
// gsc.mjs — Google Search Console ingest (SEO агент v2.1).
// Истински заявки/импресии/CTR/позиция по страна (bg/en/it) — реални данни, не мнение.
// Изисква OAuth/service-account токен (GOOGLE_OAUTH_TOKEN) и достъп до property-то.
// Без токен: казва как да го вземеш и излиза чисто (без да измисля числа).
//
// Употреба:
//   GOOGLE_OAUTH_TOKEN=ya29... node tools/seo/gsc.mjs sc-domain:carbonstealth.eu 2026-05-01 2026-06-01
const [site, start, end] = process.argv.slice(2);
const token = process.env.GOOGLE_OAUTH_TOKEN;
if (!site || !start || !end) { console.error("Употреба: node gsc.mjs <siteUrl> <YYYY-MM-DD start> <end>"); process.exit(2); }
if (!token) {
  console.error("✘ Няма GOOGLE_OAUTH_TOKEN. Вземи го (service account/OAuth) с обхват");
  console.error("  https://www.googleapis.com/auth/webmasters.readonly и достъп до property-то в GSC.");
  console.error("  Алтернатива за необработена история: GSC → BigQuery bulk export.");
  process.exit(1);
}

const api = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
const body = { startDate: start, endDate: end, dimensions: ["query", "country"], rowLimit: 50 };

try {
  const r = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GSC ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const rows = j.rows || [];
  console.log(`# Search Console · ${site} · ${start}–${end}\n`);
  console.log("позиция | CTR%  | клик. | импр. | заявка (страна)");
  for (const row of rows.slice(0, 30)) {
    const [q, c] = row.keys;
    console.log(`${row.position.toFixed(1).padStart(6)} | ${(row.ctr * 100).toFixed(1).padStart(5)} | ${String(row.clicks).padStart(5)} | ${String(row.impressions).padStart(6)} | ${q} (${c})`);
  }
  console.log(`\n${rows.length} реда. Търси: висока импресия + ниско CTR (заглавие/мета) и позиция 5–15 (бързи победи).`);
} catch (e) { console.error("✘", e.message); process.exit(1); }
