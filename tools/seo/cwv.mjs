#!/usr/bin/env node
// cwv.mjs — реални Core Web Vitals за SEO агента v2.0 (поле + лаборатория).
// Ползва Google PageSpeed Insights API (вгражда и CrUX полевите данни — реалният
// сигнал за класиране). Без ключ работи с rate-limit; с ключ е по-надеждно.
//
// Употреба:
//   node tools/seo/cwv.mjs https://zabobovdol.carbonstealth.eu [mobile|desktop]
//   PSI_KEY=xxxx node tools/seo/cwv.mjs <url>
const url = process.argv[2];
const strategy = process.argv[3] || "mobile";
if (!url) { console.error("Употреба: node cwv.mjs <url> [mobile|desktop]"); process.exit(2); }

const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
api.searchParams.set("url", url);
api.searchParams.set("strategy", strategy);
for (const c of ["PERFORMANCE"]) api.searchParams.append("category", c);
if (process.env.PSI_KEY) api.searchParams.set("key", process.env.PSI_KEY);

const THRESH = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25] };
const band = (m, v) => {
  const [g, p] = THRESH[m]; return v <= g ? "✅ добър" : v <= p ? "🟡 нужда от подобрение" : "🔴 слаб";
};

try {
  const r = await fetch(api);
  if (!r.ok) throw new Error(`PSI ${r.status} ${await r.text()}`.slice(0, 300));
  const j = await r.json();
  console.log(`\n# CWV за ${url} (${strategy})\n`);

  const field = j.loadingExperience?.metrics;
  if (field) {
    console.log("── Поле (CrUX, реални потребители — РАНКИНГ сигнал) ──");
    const map = { LARGEST_CONTENTFUL_PAINT_MS: "LCP", INTERACTION_TO_NEXT_PAINT: "INP", CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS" };
    for (const [k, name] of Object.entries(map)) {
      const p75 = field[k]?.percentile;
      if (p75 == null) continue;
      const v = name === "CLS" ? p75 / 100 : p75;
      console.log(`  ${name}: ${name === "CLS" ? v.toFixed(3) : v + "ms"}  ${band(name, v)}`);
    }
  } else console.log("── Поле: няма достатъчно CrUX данни за този URL ──");

  const la = j.lighthouseResult?.audits;
  if (la) {
    console.log("\n── Лаборатория (Lighthouse) ──");
    const lab = { "largest-contentful-paint": "LCP", "cumulative-layout-shift": "CLS", "total-blocking-time": "TBT (proxy за INP)", "speed-index": "Speed Index" };
    for (const [id, name] of Object.entries(lab)) {
      const a = la[id]; if (a) console.log(`  ${name}: ${a.displayValue ?? a.numericValue}`);
    }
    const score = j.lighthouseResult?.categories?.performance?.score;
    if (score != null) console.log(`  Performance score: ${Math.round(score * 100)}/100`);
  }
  console.log("\nБележка: полето (CrUX) е сигналът за класиране; лабораторията е за диагностика.");
} catch (e) {
  console.error("✘", e.message);
  console.error("Ако е rate-limit, задай PSI_KEY (Google Cloud → PageSpeed Insights API).");
  process.exit(1);
}
