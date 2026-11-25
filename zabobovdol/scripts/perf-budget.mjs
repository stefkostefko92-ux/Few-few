#!/usr/bin/env node
// Бюджет за производителност срещу РАБОТЕЩ сървър (BASE_URL).
// Мери по страница: размер на HTML (пренесен, т.е. компресиран, и суров) и
// времето до първия байт (TTFB). Първата заявка (студен старт) се отчита
// отделно и НЕ се прага; прагът е върху медианата на топлите заявки.
// Лабораторно измерване, не полеви данни (CrUX).
//
// Употреба:
//   BASE_URL=http://127.0.0.1:3100 node scripts/perf-budget.mjs [--runs 5] [--json]
// Изход: 0 = в бюджета, 1 = над праг, 2 = грешка при мерене.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const ri = args.indexOf("--runs");
const RUNS = Math.max(3, ri >= 0 ? Number(args[ri + 1]) || 5 : 5);
const GUIDE = process.env.GUIDE_PATH || "/kak-da/kb-smenya-klaviatura";

const num = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

// Прагове (KB = 1024 байта; htmlKb е ПРЕНЕСЕНИЯТ, компресиран HTML).
// /kak-da е известно тежка (списък от ~570 ръководства): праг „да не се влошава“.
const BUDGET = [
  { path: "/", htmlKb: num("BUDGET_HOME_KB", 60), ttfbMs: num("BUDGET_TTFB_MS", 800) },
  { path: "/kak-da", htmlKb: num("BUDGET_KAKDA_KB", 190), ttfbMs: num("BUDGET_TTFB_MS", 800) },
  { path: GUIDE, htmlKb: num("BUDGET_SMALL_KB", 60), ttfbMs: num("BUDGET_TTFB_MS", 800) },
  { path: "/uslugi", htmlKb: num("BUDGET_SMALL_KB", 60), ttfbMs: num("BUDGET_TTFB_MS", 800) },
  { path: "/dezhurna-apteka", htmlKb: num("BUDGET_SMALL_KB", 60), ttfbMs: num("BUDGET_TTFB_MS", 800) },
];

function once(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const lib = url.protocol === "https:" ? https : http;
    const t0 = process.hrtime.bigint();
    const req = lib.get(
      url,
      { headers: { "accept-encoding": "gzip, br", "user-agent": "zbd-perf-budget" } },
      (res) => {
        const ttfb = Number(process.hrtime.bigint() - t0) / 1e6;
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const wire = Buffer.concat(chunks);
          const enc = res.headers["content-encoding"];
          let raw = wire;
          try {
            if (enc === "gzip") raw = zlib.gunzipSync(wire);
            else if (enc === "br") raw = zlib.brotliDecompressSync(wire);
          } catch (e) {
            return reject(e);
          }
          resolve({
            status: res.statusCode,
            ttfb,
            wireBytes: wire.length,
            rawBytes: raw.length,
            gzBytes: enc ? wire.length : zlib.gzipSync(raw).length,
            encoded: Boolean(enc),
          });
        });
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error("таймаут 30 s")));
    req.on("error", reject);
  });
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const rows = [];
  let failed = false;
  for (const b of BUDGET) {
    const runs = [];
    for (let i = 0; i < RUNS + 1; i++) runs.push(await once(b.path));
    const bad = runs.find((r) => r.status !== 200);
    if (bad) throw new Error(`${b.path}: HTTP ${bad.status}`);
    const cold = runs[0];
    const warm = runs.slice(1);
    const ttfb = median(warm.map((r) => r.ttfb));
    const spread = [Math.min(...warm.map((r) => r.ttfb)), Math.max(...warm.map((r) => r.ttfb))];
    const rawKb = warm[0].rawBytes / 1024;
    // Без компресия на сървъра (напр. директно next start) — мерим gzip на суровия HTML.
    const gzKb = warm[0].gzBytes / 1024;
    const okHtml = gzKb <= b.htmlKb;
    const okTtfb = ttfb <= b.ttfbMs;
    if (!okHtml || !okTtfb) failed = true;
    rows.push({
      path: b.path,
      htmlGzKb: round(gzKb),
      htmlRawKb: round(rawKb),
      ttfbMedianMs: Math.round(ttfb),
      ttfbRangeMs: spread.map(Math.round),
      ttfbColdMs: Math.round(cold.ttfb),
      limits: { htmlGzKb: b.htmlKb, ttfbMs: b.ttfbMs },
      ok: okHtml && okTtfb,
    });
  }
  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, runs: RUNS, rows, ok: !failed }, null, 2));
  } else {
    console.log(`Бюджет за производителност — ${BASE}, ${RUNS} топли заявки + 1 студена`);
    for (const r of rows) {
      console.log(
        `${r.ok ? "OK  " : "НАД "} ${r.path.padEnd(34)} HTML gzip ${String(r.htmlGzKb).padStart(6)} KB (≤${r.limits.htmlGzKb}) · ` +
          `TTFB мед. ${r.ttfbMedianMs} ms [${r.ttfbRangeMs[0]}–${r.ttfbRangeMs[1]}] (≤${r.limits.ttfbMs}) · студена ${r.ttfbColdMs} ms`,
      );
    }
    console.log(failed ? "РЕЗУЛТАТ: над бюджета" : "РЕЗУЛТАТ: в бюджета");
    console.log("Забележка: лабораторни числа от една машина, не полеви данни (CrUX).");
  }
  process.exit(failed ? 1 : 0);
}

function round(n) {
  return Math.round(n * 10) / 10;
}

main().catch((e) => {
  console.error("Грешка при мерене:", e.message);
  process.exit(2);
});
