// prelaunch-audit.test.mjs — кривите за оценка трябва да са Lighthouse-съвместими.
//
// Числото има смисъл само ако възпроизвежда СЪЩАТА крива като PageSpeed. Контролните точки са
// публични: p10 дава ~90, медианата дава ~50. Ако кривата ни се разминава, „приближаваме се до 100"
// би гонило грешна цел — по-лошо от липсващо измерване.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMetric, performanceScore, advise, totalBlockingTime, shouldGzip } from "./prelaunch-audit.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test("контролните точки дават 90 и 50 (това е дефиницията на кривата)", () => {
  // LCP mobile: p10=2500 → ~0.90 · медиана=4000 → ~0.50
  near(scoreMetric(2500, 2500, 4000) * 100, 90, 2, "p10 трябва да дава 90");
  near(scoreMetric(4000, 2500, 4000) * 100, 50, 2, "медианата трябва да дава 50");
  // TBT mobile: p10=200 · медиана=600
  near(scoreMetric(200, 200, 600) * 100, 90, 2, "TBT p10");
  near(scoreMetric(600, 200, 600) * 100, 50, 2, "TBT медиана");
});

test("оценката пада монотонно с влошаване на метриката", () => {
  const s = [500, 1500, 2500, 4000, 8000].map((v) => scoreMetric(v, 2500, 4000));
  for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1], `оценката трябва да пада: ${s}`);
});

test("много добра стойност → близо до 100; много лоша → близо до 0", () => {
  assert.ok(scoreMetric(200, 2500, 4000) > 0.99, "отлично LCP");
  assert.ok(scoreMetric(30000, 2500, 4000) < 0.02, "ужасно LCP");
});

test("нулева/невалидна стойност не чупи оценката", () => {
  assert.equal(scoreMetric(0, 2500, 4000), 1, "0ms е перфектно");
  assert.equal(scoreMetric(null, 2500, 4000), null, "неизмереното не се измисля");
  assert.equal(scoreMetric(undefined, 2500, 4000), null);
});

test("перфектни метрики дават 100, катастрофални дават ~0", () => {
  assert.equal(performanceScore({ FCP: 100, LCP: 200, TBT: 0, CLS: 0 }).score, 100);
  assert.ok(performanceScore({ FCP: 20000, LCP: 30000, TBT: 15000, CLS: 2 }).score <= 2);
});

test("НЕизмерена метрика не тежи (теглата се пренормират, не се предполага)", () => {
  const full = performanceScore({ FCP: 1800, LCP: 2500, TBT: 200, CLS: 0.1 });
  assert.equal(full.weightBase, 90, "FCP10+LCP25+TBT30+CLS25 = 90 (Speed Index не се мери)");
  const partial = performanceScore({ FCP: 1800, LCP: 2500, TBT: null, CLS: 0.1 });
  assert.equal(partial.weightBase, 60, "липсващият TBT маха своите 30%");
  assert.ok(partial.parts.every((p) => p.metric !== "TBT"));
});

test("desktop профилът е по-строг от mobile (същата стойност → по-ниска оценка)", () => {
  const v = { FCP: 1500, LCP: 2000, TBT: 250, CLS: 0.05 };
  assert.ok(performanceScore(v, "desktop").score < performanceScore(v, "mobile").score,
    "десктоп праговете са по-строги — иначе профилът е декорация");
});

test("TBT тежи най-много (30%) — както в Lighthouse v10", () => {
  const base = { FCP: 1000, LCP: 1500, TBT: 100, CLS: 0.01 };
  const badTBT = performanceScore({ ...base, TBT: 3000 }).score;
  const badFCP = performanceScore({ ...base, FCP: 6000 }).score;
  assert.ok(badTBT < badFCP, "влошен TBT трябва да боли повече от влошен FCP");
});

// --- Съветите трябва да са конкретни и приоритизирани ------------------------------

const noDiag = { renderBlocking: [], imgNoDims: [], imgNoLazy: [], hugeInline: 0, fontsNoDisplay: [] };

test("чист сайт → нула съвети (без измислени находки)", () => {
  const tips = advise({ metrics: { FCP: 900, LCP: 1200, TBT: 50, CLS: 0.01, domNodes: 300 }, requests: [], diag: noDiag }, "mobile");
  assert.deepEqual(tips, []);
});

test("изображения без размери дават съвет за CLS с ВИСОК приоритет", () => {
  const tips = advise({
    metrics: { FCP: 900, LCP: 1200, TBT: 50, CLS: 0.01, domNodes: 300 }, requests: [],
    diag: { ...noDiag, imgNoDims: ["a.png", "b.png"] },
  }, "mobile");
  const t = tips.find((x) => /width\/height/.test(x.what));
  assert.ok(t, "трябва да съветва за размери");
  assert.equal(t.impact, "висок");
  assert.equal(t.metric, "CLS");
});

test("некомпресирани текстови ресурси се хващат, а малките/бинарните — не", () => {
  const tips = advise({
    metrics: { FCP: 900, LCP: 1200, TBT: 50, CLS: 0.01, domNodes: 300 },
    requests: [
      { url: "big.js", type: "text/javascript", size: 300000, encoding: "" },      // хваща се
      { url: "small.css", type: "text/css", size: 1000, encoding: "" },            // под прага
      { url: "ok.js", type: "text/javascript", size: 300000, encoding: "br" },     // компресиран
      { url: "pic.png", type: "image/png", size: 900000, encoding: "" },           // бинарен
    ],
    diag: noDiag,
  }, "mobile");
  const t = tips.find((x) => /компресия/.test(x.what));
  assert.ok(t, "трябва да хване некомпресирания JS");
  assert.match(t.what, /^1 /, "точно един ресурс, не четири");
});

test("всеки съвет казва КАКВО и КАК (иначе е оплакване, не насока)", () => {
  const tips = advise({
    metrics: { FCP: 5000, LCP: 6000, TBT: 2000, CLS: 0.5, domNodes: 3000 },
    requests: [], diag: { ...noDiag, renderBlocking: ["x.css"], imgNoDims: ["y.png"] },
  }, "mobile");
  assert.ok(tips.length >= 5);
  for (const t of tips) {
    assert.ok(t.what && t.what.length > 5, "какво");
    assert.ok(t.how && t.how.length > 10, "как");
    assert.ok(["висок", "среден", "нисък"].includes(t.impact));
  }
});

// ── TBT: прозорецът, който веднъж вече беше грешен ───────────────────────────────────
// Първата версия събираше `duration - 50` по ВСИЧКИ дълги задачи за целия живот на страницата,
// включително тези ПРЕДИ First Contentful Paint (стартиране на браузъра, парсване, компилация под
// 4× CPU throttle), които Lighthouse изрично изключва. Върху kebab/ — статичен сайт с един малък
// app.js — това даваше TBT ≈1002 ms и оценка 75/100; правилният прозорец дава 224 ms и 95/100.
// Двадесет точки разлика, които щяха да пратят оптимизацията по несъществуващ JS проблем.

test("TBT изключва дългите задачи ПРЕДИ FCP", () => {
  const tasks = [{ start: 100, dur: 300 }, { start: 2000, dur: 250 }];
  // само втората е след FCP=1000 → 250 − 50 = 200
  assert.equal(totalBlockingTime(tasks, 1000), 200);
  // без прозорец (старото поведение) би било (300−50) + (250−50) = 450
  assert.equal(totalBlockingTime(tasks, 0), 450);
});

test("TBT изрязва задача, която започва преди FCP и продължава след него", () => {
  // задача 800→1400, FCP=1000 → броимата част е 400 ms → 400 − 50 = 350
  assert.equal(totalBlockingTime([{ start: 800, dur: 600 }], 1000), 350);
});

test("TBT не брои отрицателно и игнорира задачи под прага след изрязване", () => {
  // задача 900→1030, FCP=1000 → остават 30 ms < 50 → нула, не −20
  assert.equal(totalBlockingTime([{ start: 900, dur: 130 }], 1000), 0);
  assert.equal(totalBlockingTime([{ start: 10, dur: 900 }], 5000), 0, "изцяло преди FCP → нула");
});

test("TBT е устойчив на липсващи/повредени входни данни", () => {
  assert.equal(totalBlockingTime(null, 1000), 0);
  assert.equal(totalBlockingTime([], 1000), 0);
  assert.equal(totalBlockingTime([{}], 1000), 0);
  // липсващ FCP → прозорецът пада към 0 (консервативно: брои всичко, не мълчи с нула)
  assert.equal(totalBlockingTime([{ start: 0, dur: 200 }], null), 150);
});

// ── Компресия: инструментът не бива да обвинява сайта в СОБСТВЕНИЯ си дефект ──────────
// Вътрешният статичен сървър не гзипваше нищо. Резултат: по Slow 4G HTML/CSS/JS пътуваха
// некомпресирани, FCP/LCP излизаха по-бавни, отколкото ще са в продукция, и отгоре одитът
// докладваше „4 текстови ресурса без компресия" като находка ЗА САЙТА. Върху kebab/ това
// струваше 4 точки и 87 KB измислен трансфер (185 KB → 98 KB, 95/100 → 99/100).

test("гзипва се текстът, не вече компресираните формати", () => {
  assert.equal(shouldGzip("text/html", "gzip, deflate, br"), true);
  assert.equal(shouldGzip("text/css", "gzip"), true);
  assert.equal(shouldGzip("text/javascript", "gzip"), true);
  assert.equal(shouldGzip("application/json", "gzip"), true);
  assert.equal(shouldGzip("image/png", "gzip"), false, "PNG вече е компресиран");
  assert.equal(shouldGzip("image/svg+xml", "gzip"), false, "SVG минава като image/* — не го пипаме");
  assert.equal(shouldGzip("font/woff2", "gzip"), false, "woff2 вече е компресиран");
});

test("гзип само ако клиентът го обяви (иначе е счупен отговор)", () => {
  assert.equal(shouldGzip("text/html", "br"), false);
  assert.equal(shouldGzip("text/html", ""), false);
  assert.equal(shouldGzip("text/html", undefined), false);
  assert.equal(shouldGzip(undefined, "gzip"), false);
});
