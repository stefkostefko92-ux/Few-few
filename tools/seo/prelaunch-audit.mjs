#!/usr/bin/env node
// prelaunch-audit.mjs — PageSpeed-съвместим одит ПРЕДИ сайтът да е жив.
//
// ЗАЩО НЕ pagespeed.web.dev. PageSpeed Insights дърпа URL-а от сървърите на Google. Сайт, който още
// не е публикуван, е недостъпен за тях — затова „сканирай през pagespeed преди да пуснем" е
// невъзможно по устройство, не заради ключ или квота. (`tools/seo/cwv.mjs` вика същото API и е
// правилният инструмент СЛЕД пускане.)
//
// КАКВО ПРАВИМ ВМЕСТО ТОВА. Лабораторната половина на PageSpeed е Lighthouse, а Lighthouse е просто
// Chromium + измервания. Тук пускаме СЪЩИЯ Chromium срещу локален билд и смятаме СЪЩИТЕ метрики със
// СЪЩИТЕ криви за оценка (log-normal, контролни точки p10/медиана от Lighthouse v10). Затова числото
// е съпоставимо с раздела „Lab data" / „Performance" на PageSpeed.
//
// КАКВО НЕ МОЖЕ ДА СЕ РЕПЛИЦИРА — и не се преструваме, че можем:
//   • CrUX (полеви данни) = реални потребители за 28 дни. Преди пускане такива НЯМА. Никакъв
//     локален инструмент не може да ги произведе; който твърди обратното, лъже.
//   • Speed Index иска филмова лента от рендера. Не го смятаме и НЕ го включваме в тежестите —
//     теглата се пренормират върху измереното, а отчетът го казва изрично.
// Затова: това е ранно предупреждение с висока точност, а не заместител на PSI след деплой.
//
//   node tools/seo/prelaunch-audit.mjs <папка|URL> [--desktop] [--json] [--min 90]
//   node tools/seo/prelaunch-audit.mjs kebab --min 90        # гейт: пада под прага

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { emitJson, finish } from "../lib/emit.mjs";

const argv = process.argv.slice(2);
const TARGET = argv.find((a) => !a.startsWith("--"));
const JSON_OUT = argv.includes("--json");
const DESKTOP = argv.includes("--desktop");
const MIN = (() => { const i = argv.indexOf("--min"); return i >= 0 ? Number(argv[i + 1]) : null; })();

// ВНИМАНИЕ: проверката на аргумента живее в `main()`, НЕ на най-горно ниво. Валидация с
// `process.exit()` в тялото на модула се изпълнява и при `import` — тоест убива тест-рънъра, който
// внася чистите функции. Този клас вече ме удари днес (syntax-check.mjs) и го повторих тук.

// ── Криви за оценка (Lighthouse v10) ────────────────────────────────────────────────
// Всяка метрика се преобразува в 0–100 през log-normal CDF с две контролни точки:
// p10 (стойност, която дава 90) и медиана (която дава 50). Числата са публичните на Lighthouse.
const CURVES = {
  mobile: { FCP: [1800, 3000], LCP: [2500, 4000], TBT: [200, 600], CLS: [0.1, 0.25] },
  desktop: { FCP: [934, 1600], LCP: [1200, 2400], TBT: [150, 350], CLS: [0.1, 0.25] },
};
// Тежести на Lighthouse v10. Speed Index (10%) НЕ се мери тук → изключен и теглата се пренормират.
const WEIGHTS = { FCP: 10, LCP: 25, TBT: 30, CLS: 25 };

/**
 * Total Blocking Time в ПРОЗОРЕЦ, започващ от FCP — както го дефинира Lighthouse.
 *
 * Първата версия тук събираше `duration - 50` по ВСИЧКИ дълги задачи за целия живот на страницата.
 * Това е грешно и то в посока „сайтът изглежда по-зле, отколкото е": задачите ПРЕДИ First
 * Contentful Paint (стартиране на браузъра, парсване, компилация под 4× CPU throttle) са изрично
 * ИЗКЛЮЧЕНИ от TBT. Измерено върху `kebab/` — статичен сайт с един малък `app.js`, 10 заявки,
 * 185 KB — старата сметка даваше ~1000 ms TBT, което не е правдоподобно за такъв сайт и щеше да
 * прати оптимизацията да гони несъществуващ JS проблем.
 *
 * Долната граница е точно тази на Lighthouse (FCP). Горната при тях е TTI, която иска пълен trace
 * (5 s тишина на главната нишка) — тук не я смятаме, затова броим ДО КРАЯ на измерването. Тоест
 * прозорецът ни е по-ШИРОК от техния и числото може да е по-високо, но никога по-ниско:
 * **консервативно е — не ласкае сайта.** Отчетът го казва.
 *
 * Частично припокриващите се задачи се ИЗРЯЗВАТ: задача, започнала преди FCP и продължила след
 * него, брои само частта си след FCP. Блокиращото време на всяка е `max(0, изрязана − 50 ms)`.
 */
export function totalBlockingTime(longTasks, fcp) {
  if (!Array.isArray(longTasks)) return 0;
  const from = Number.isFinite(fcp) ? fcp : 0;
  return longTasks.reduce((sum, t) => {
    const start = Number(t?.start ?? 0);
    const end = start + Number(t?.dur ?? 0);
    const clipped = end - Math.max(start, from);
    return sum + Math.max(0, clipped - 50);
  }, 0);
}

/** Lighthouse-ката log-normal оценка: връща 0..1. */
export function scoreMetric(value, p10, median) {
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return 1;
  // Lighthouse ползва log-normal CDF; тези константи възпроизвеждат кривата им.
  const SD = Math.log(median / p10) / (Math.SQRT2 * 0.9061938024368232);
  const z = (Math.log(value) - Math.log(median)) / (SD * Math.SQRT2);
  return Math.min(1, Math.max(0, 0.5 * erfc(z)));
}
// Допълваща функция на грешките (Abramowitz–Stegun 7.1.26) — достатъчна точност за оценка.
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + z / 2);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export function performanceScore(metrics, profile = "mobile") {
  const c = CURVES[profile];
  const parts = [];
  let total = 0, weighted = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const s = scoreMetric(metrics[k], c[k][0], c[k][1]);
    if (s === null) continue;              // неизмерена метрика не тежи (не я познаваме на едро)
    parts.push({ metric: k, value: metrics[k], score: Math.round(s * 100), weight: w });
    weighted += s * w; total += w;
  }
  return { score: total ? Math.round((weighted / total) * 100) : null, parts, weightBase: total };
}

// ── Мъничък статичен сървър (нула зависимости) ──────────────────────────────────────
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon" };

async function serve(dir) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      let f = join(root, p);
      if (existsSync(f) && (await stat(f)).isDirectory()) f = join(f, "index.html");
      if (!existsSync(f)) { res.writeHead(404); return res.end("404"); }
      const buf = await readFile(f);
      res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream", "content-length": buf.length });
      res.end(buf);
    } catch { res.writeHead(500); res.end("500"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

function findChromium() {
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    for (const p of [join(base, d, "chrome-linux", "chrome"), join(base, d, "chrome-linux", "headless_shell")])
      if (existsSync(p)) return p;
  }
  return null;
}

// ── Измерване в реален Chromium ─────────────────────────────────────────────────────
async function measure(url) {
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch {
    // Гейт, който не може да се изпълни, ТРЯБВА да го каже с код за грешка — не да мълчи в зелено.
    console.error("✘ Липсва playwright-core. Инсталирай: npm i -D playwright-core");
    process.exit(2);
  }
  const exe = findChromium();
  if (!exe) { console.error("✘ Не намирам Chromium в /opt/pw-browsers"); process.exit(2); }

  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  // Профилът на PageSpeed за мобилно: 4x CPU throttle + Moto G-подобен viewport.
  const ctx = await browser.newContext(DESKTOP
    ? { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 }
    : { viewport: { width: 412, height: 823 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (!DESKTOP) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });        // както Lighthouse mobile
    await cdp.send("Network.emulateNetworkConditions", {                   // ~Slow 4G
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }

  const requests = [];
  page.on("response", async (r) => {
    try {
      const h = r.headers();
      requests.push({ url: r.url(), status: r.status(), type: h["content-type"] || "",
        size: Number(h["content-length"] || 0), encoding: h["content-encoding"] || "" });
    } catch { /* игнорирай затворени отговори */ }
  });

  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, longTasks: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; })
      .observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; })
      .observe({ type: "layout-shift", buffered: true });
    // Пазим НАЧАЛО + ПРОДЪЛЖИТЕЛНОСТ, не само продължителността: TBT се смята в прозорец, който
    // започва от FCP, а сумата иска изрязване на частично припокриващите се задачи (виж по-долу).
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longTasks.push({ start: e.startTime, dur: e.duration }); })
      .observe({ type: "longtask", buffered: true });
  });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  // Изчакваме мрежата да утихне по СЪСТОЯНИЕ (не сляпо), после четем метриките.
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500); // прозорец за късни layout shift-ове

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      FCP: fcp ? fcp.startTime : null,
      LCP: window.__m.lcp || null,
      CLS: window.__m.cls,
      longTasks: window.__m.longTasks,
      TTFB: nav.responseStart || null,
      DCL: nav.domContentLoadedEventEnd || null,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
  // TBT се смята ТУК (в Node), не в страницата: така сметката е чиста функция и е тествана
  // отделно — прозорецът ѝ вече веднъж беше грешен и никой тест не можеше да го хване.
  m.TBT = totalBlockingTime(m.longTasks, m.FCP);
  delete m.longTasks;

  // Диагностика — това, което казва КАК да се стигне до 100.
  const diag = await page.evaluate(() => {
    const out = { renderBlocking: [], imgNoDims: [], imgNoLazy: [], hugeInline: 0, fontsNoDisplay: [] };
    for (const l of document.querySelectorAll('link[rel="stylesheet"]'))
      if (!l.media || l.media === "all") out.renderBlocking.push(l.href);
    for (const s of document.querySelectorAll("script[src]"))
      if (!s.defer && !s.async && !/module/.test(s.type || "")) out.renderBlocking.push(s.src);
    const imgs = [...document.images];
    for (const i of imgs) {
      if (!i.getAttribute("width") || !i.getAttribute("height")) out.imgNoDims.push(i.currentSrc || i.src);
      if (!i.loading || i.loading === "eager") out.imgNoLazy.push(i.currentSrc || i.src);
    }
    for (const st of document.querySelectorAll("style")) out.hugeInline += (st.textContent || "").length;
    for (const sh of document.styleSheets) {
      try { for (const r of sh.cssRules) if (r.constructor.name === "CSSFontFaceRule" && !/font-display/i.test(r.cssText)) out.fontsNoDisplay.push(r.style.fontFamily); }
      catch { /* CORS-ограничен лист */ }
    }
    return out;
  });

  await browser.close();
  return { metrics: m, requests, diag, elapsed: Date.now() - t0 };
}

// ── Съвети: конкретно какво пречи на 100 ────────────────────────────────────────────
export function advise({ metrics, requests, diag }, profile) {
  const tips = [];
  const c = CURVES[profile];
  const bytes = requests.reduce((s, r) => s + (r.size || 0), 0);
  const uncompressed = requests.filter((r) => /text|javascript|json|css|svg/.test(r.type) && !r.encoding && (r.size || 0) > 4096);

  if (metrics.LCP > c.LCP[0]) tips.push({ impact: "висок", metric: "LCP",
    what: `LCP е ${Math.round(metrics.LCP)}ms (цел ≤${c.LCP[0]}ms)`,
    how: "предзареди LCP изображението (`<link rel=preload as=image>`), сервирай AVIF/WebP, махни render-blocking CSS над сгъвката" });
  if (metrics.TBT > c.TBT[0]) tips.push({ impact: "висок", metric: "TBT",
    what: `TBT е ${Math.round(metrics.TBT)}ms (цел ≤${c.TBT[0]}ms)`,
    how: "разцепи дългите задачи, отложи несъщностния JS (`defer`/`type=module`), махни неизползвани библиотеки" });
  if (metrics.CLS > c.CLS[0]) tips.push({ impact: "висок", metric: "CLS",
    what: `CLS е ${metrics.CLS.toFixed(3)} (цел ≤${c.CLS[0]})`,
    how: "дай `width`/`height` на всяко изображение, резервирай място за банери/реклами, `font-display: optional`" });
  if (metrics.FCP > c.FCP[0]) tips.push({ impact: "среден", metric: "FCP",
    what: `FCP е ${Math.round(metrics.FCP)}ms (цел ≤${c.FCP[0]}ms)`,
    how: "инлайнвай критичния CSS, намали TTFB, прати по-малко байтове преди първия рендер" });

  if (diag.renderBlocking.length) tips.push({ impact: "висок", metric: "FCP/LCP",
    what: `${diag.renderBlocking.length} render-blocking ресурса`,
    how: "`defer` на скриптовете, `media`/`preload` на несъщностния CSS", items: diag.renderBlocking.slice(0, 6) });
  if (diag.imgNoDims.length) tips.push({ impact: "висок", metric: "CLS",
    what: `${diag.imgNoDims.length} изображения без width/height`,
    how: "винаги задавай размери — това е най-честата причина за CLS", items: diag.imgNoDims.slice(0, 6) });
  if (uncompressed.length) tips.push({ impact: "среден", metric: "трансфер",
    what: `${uncompressed.length} текстови ресурса без компресия`,
    how: "включи gzip/brotli на сървъра (Nginx `gzip on` / `brotli on`)", items: uncompressed.slice(0, 6).map((r) => r.url) });
  if (diag.imgNoLazy.length > 3) tips.push({ impact: "среден", metric: "трансфер",
    what: `${diag.imgNoLazy.length} изображения без lazy-loading`,
    how: "`loading=\"lazy\"` на всичко под сгъвката (НЕ на LCP изображението)" });
  if (diag.fontsNoDisplay.length) tips.push({ impact: "среден", metric: "FCP/CLS",
    what: `${diag.fontsNoDisplay.length} @font-face без font-display`,
    how: "`font-display: swap` (или `optional` за минимален CLS)" });
  if (bytes > 1_600_000) tips.push({ impact: "среден", metric: "трансфер",
    what: `~${Math.round(bytes / 1024)} KB общ трансфер`, how: "смали изображенията, изчисти неизползван CSS/JS" });
  if (metrics.domNodes > 1500) tips.push({ impact: "нисък", metric: "TBT",
    what: `${metrics.domNodes} DOM възела`, how: "опрости маркъпа; големият DOM оскъпява всеки стил/лейаут" });

  return tips;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

async function main() {
  if (!TARGET) {
    console.error("употреба: prelaunch-audit.mjs <папка|URL> [--desktop] [--json] [--min N] [--runs N]");
    return finish(2);
  }
  const profile = DESKTOP ? "desktop" : "mobile";
  let url = TARGET, srv = null;
  if (!/^https?:\/\//.test(TARGET)) {
    if (!existsSync(TARGET)) { console.error(`няма такава папка: ${TARGET}`); process.exit(2); }
    srv = await serve(TARGET); url = srv.url;
  }

  // МЕДИАНА ОТ N РАНА, не единичен. TBT под CPU throttle варира силно на споделена машина
  // (измерено: 1003–1491ms за един и същ сайт). Единично число тук е шум, представен за факт —
  // а по шум не се гони 100. Lighthouse има същия проблем и PageSpeed също пуска повторно.
  const RUNS = (() => { const i = argv.indexOf("--runs"); return i >= 0 ? Math.max(1, Number(argv[i + 1]) || 3) : 3; })();
  const all = [];
  for (let i = 0; i < RUNS; i++) all.push(await measure(url));
  if (srv) srv.server.close();

  const res = {
    // Диагностиката е детерминистична (структура на страницата) → взимаме последния ран.
    ...all[all.length - 1],
    metrics: Object.fromEntries(["FCP", "LCP", "CLS", "TBT", "TTFB", "DCL", "domNodes"].map((k) => {
      const vs = all.map((r) => r.metrics[k]).filter(Number.isFinite);
      return [k, vs.length ? median(vs) : null];
    })),
  };
  res.runs = RUNS;
  res.spread = Object.fromEntries(["LCP", "TBT", "CLS"].map((k) => {
    const vs = all.map((r) => r.metrics[k]).filter(Number.isFinite);
    return [k, vs.length > 1 ? Math.round(Math.max(...vs) - Math.min(...vs)) : 0];
  }));

  const { score, parts, weightBase } = performanceScore(res.metrics, profile);
  const tips = advise(res, profile);
  const bytes = res.requests.reduce((s, r) => s + (r.size || 0), 0);

  if (JSON_OUT) {
    return emitJson({
      target: TARGET, profile, score, parts, metrics: res.metrics,
      requests: res.requests.length, transferBytes: bytes, tips, runs: res.runs, spread: res.spread,
      note: "лабораторни данни (както раздела Lab на PageSpeed). Полевите CrUX данни изискват реални потребители и НЕ могат да се получат преди пускане.",
    }, MIN != null && score != null && score < MIN ? 1 : 0);
  }

  const g = (s) => `\x1b[32m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, r = (s) => `\x1b[31m${s}\x1b[0m`, d = (s) => `\x1b[90m${s}\x1b[0m`;
  const band = (n) => (n >= 90 ? g(n) : n >= 50 ? y(n) : r(n));

  console.log(`\n⚡  Предпусков одит — ${TARGET}  ${d(`(${profile}${DESKTOP ? "" : ", 4× CPU + Slow 4G — както Lighthouse"})`)}\n`);
  console.log(`   Производителност: ${band(score ?? "—")}/100\n`);
  console.log("   метрика   стойност        оценка   тегло");
  for (const p of parts) {
    const v = p.metric === "CLS" ? p.value.toFixed(3) : `${Math.round(p.value)}ms`;
    console.log(`   ${p.metric.padEnd(9)} ${String(v).padEnd(15)} ${band(p.score)}/100   ${p.weight}%`);
  }
  console.log(d(`\n   Теглата са пренормирани върху ${weightBase}% (Speed Index не се мери тук — иска филмова лента).`));
  console.log(d(`   TBT се брои от FCP до края на измерването (Lighthouse спира на TTI) — прозорецът ни`));
  console.log(d(`   е по-широк, значи числото може да е по-високо от тяхното, но никога по-ниско.`));
  console.log(d(`   ${res.requests.length} заявки · ~${Math.round(bytes / 1024)} KB трансфер · медиана от ${res.runs} рана`));
  const noisy = Object.entries(res.spread).filter(([, v]) => v > 0);
  if (noisy.length) console.log(d(`   разсейване между раните: ${noisy.map(([k, v]) => `${k} ±${k === "CLS" ? v : v + "ms"}`).join(" · ")}`));

  if (tips.length) {
    console.log(`\n   Какво пречи на 100:\n`);
    for (const t of tips) {
      const c = t.impact === "висок" ? r("●") : t.impact === "среден" ? y("●") : d("●");
      console.log(`   ${c} [${t.metric}] ${t.what}`);
      console.log(d(`       → ${t.how}`));
      if (t.items) for (const i of t.items) console.log(d(`         · ${String(i).slice(0, 96)}`));
    }
  } else console.log(g("\n   ✓ няма открити спирачки — сайтът е чист по измеримите сигнали."));

  console.log(d(`\n   Това са ЛАБОРАТОРНИ данни (както раздела „Lab" на PageSpeed). Полевите CrUX данни`));
  console.log(d(`   изискват реални потребители за 28 дни — преди пускане такива НЯМА и никой локален`));
  console.log(d(`   инструмент не може да ги произведе. След деплой сверявай с tools/seo/cwv.mjs.\n`));

  if (MIN != null && score != null && score < MIN) {
    console.error(r(`✗ ${score} < ${MIN} — прагът не е достигнат.`));
    return finish(1);
  }
  finish(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
