// Прогноза и аномалии — чиста математика върху историята на метриките.
// Това е разликата между табло, което ПОКАЗВА, и табло, което ПРЕДУПРЕЖДАВА:
// „дискът се пълни за 3.2 дни" е действено, „дискът е на 86%" — не.
//
// Избор на методи (и защо не по-очевидните):
//  • Theil–Sen вместо най-малки квадрати: точка на срив ~29% срещу 0% — един
//    временен архив от 20 GB не изкривява наклона. (Prometheus predict_linear е
//    МНК и точно затова вдига фалшиви аларми на нови машини.)
//  • MAD вместо стандартно отклонение: средното и σ се влачат от самата аномалия.
//  • Mann–Kendall като гейт: не показваме прогноза, ако трендът не е значим.

// ── Медиана и MAD ─────────────────────────────────────────────────────────────
import { plural } from './text.js';
export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mad(arr, med = median(arr)) {
  if (!arr.length) return null;
  return median(arr.map((x) => Math.abs(x - med)));
}

// Модифициран z-score (Iglewicz–Hoaglin). Праг |z| > 3.5 е аномалия.
// Връща null при MAD=0 (константен ред) — fail-closed, вместо безкрайност.
export function robustZ(value, arr) {
  const med = median(arr);
  const m = mad(arr, med);
  if (med === null || !m) return null;
  return (value - med) / (1.4826 * m);
}

// ── EWMA: улавя бавното пълзене (изтичане на памет), което z-score пропуска ───
export function ewma(values, lambda = 0.2) {
  if (!values.length) return null;
  let z = values[0];
  for (let i = 1; i < values.length; i++) z = lambda * values[i] + (1 - lambda) * z;
  return z;
}

// ── Theil–Sen: наклон = медиана на всички двойкови наклона ────────────────────
// points: [{x, y}] — x в милисекунди, y в каквато и да е единица.
export function theilSen(points) {
  const n = points.length;
  if (n < 3) return null;
  const slopes = [];
  // При много точки взимаме подизвадка — O(n²) двойки иначе става скъпо.
  const step = n > 200 ? Math.ceil(n / 200) : 1;
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const dx = points[j].x - points[i].x;
      if (dx === 0) continue;
      slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (slopes.length < 3) return null;
  const slope = median(slopes);
  const intercept = median(points.map((p) => p.y - slope * p.x));
  return { slope, intercept, samples: slopes.length };
}

// ── Mann–Kendall: има ли изобщо значим тренд (|Z| > 1.96 при 95%) ────────────
export function mannKendall(values) {
  const n = values.length;
  if (n < 8) return { significant: false, z: 0, n };
  let S = 0;
  const step = n > 200 ? Math.ceil(n / 200) : 1;
  const v = values.filter((_, i) => i % step === 0);
  const m = v.length;
  for (let i = 0; i < m - 1; i++) {
    for (let j = i + 1; j < m; j++) S += Math.sign(v[j] - v[i]);
  }
  const varS = (m * (m - 1) * (2 * m + 5)) / 18;
  if (varS <= 0) return { significant: false, z: 0, n: m };
  const z = (S - Math.sign(S)) / Math.sqrt(varS);
  return { significant: Math.abs(z) > 1.96, z, n: m, S };
}

// ── Прогноза кога редът ще стигне граница ────────────────────────────────────
// Връща null, ако трендът не е значим или сочи надолу — по-добре мълчание,
// отколкото „дискът ще се напълни" на всяко трепване.
export function forecastToLimit(rawPoints, limit, { minPoints = 8, maxHorizonMs = 90 * 86400000 } = {}) {
  if (!Array.isArray(rawPoints) || rawPoints.length < minPoints) {
    return { ok: false, reason: 'малко данни' };
  }
  // Подредбата по време се НАЛАГА, не се предполага. Историята се дописва по ред,
  // но скок на часовника назад (NTP корекция, върнат снапшот на виртуалната
  // машина) или компактиране разбъркват реда — и тогава `points[n-1]` е НАЙ-
  // СТАРАТА точка. Прогнозата тихо се закотвя за грешен момент и връща уверено
  // грешен срок (проверено: обърнат ред дава `ok:true` с дата в миналото).
  const points = [...rawPoints].sort((a, b) => a.x - b.x);
  const values = points.map((p) => p.y);
  const mk = mannKendall(values);
  if (!mk.significant) return { ok: false, reason: 'няма значим тренд', z: mk.z };
  const fit = theilSen(points);
  if (!fit || !(fit.slope > 0)) return { ok: false, reason: 'не расте' };

  const last = points[points.length - 1];
  const remaining = limit - last.y;
  if (remaining <= 0) return { ok: true, etaMs: 0, atLimit: true, slopePerDay: fit.slope * 86400000 };
  const etaMs = remaining / fit.slope;
  if (etaMs > maxHorizonMs) return { ok: false, reason: 'далеч отвъд хоризонта', etaMs };
  return {
    ok: true,
    etaMs,
    etaAt: new Date(last.x + etaMs).toISOString(),
    slopePerDay: fit.slope * 86400000,
    z: mk.z,
    basedOn: points.length,
  };
}

// ── Ансамбъл за аномалия ─────────────────────────────────────────────────────
// Урокът на Netdata: фалшивите положителни се убиват с КОНСЕНСУС, не с по-хитър
// алгоритъм. Изискваме поне два независими сигнала да се съгласят.
export function detectAnomaly(values, { zThreshold = 3.5, ewmaFactor = 2.5 } = {}) {
  if (values.length < 10) return { anomaly: false, reason: 'малко данни' };
  const current = values[values.length - 1];
  const history = values.slice(0, -1);

  const z = robustZ(current, history);
  const zHit = z !== null && Math.abs(z) > zThreshold;

  const base = ewma(history);
  const m = mad(history);
  const ewmaHit = base !== null && m ? Math.abs(current - base) > ewmaFactor * 1.4826 * m : false;

  const votes = [zHit, ewmaHit].filter(Boolean).length;
  return {
    anomaly: votes >= 2,
    votes,
    z: z === null ? null : Math.round(z * 100) / 100,
    current,
    baseline: base === null ? null : Math.round(base * 100) / 100,
  };
}

// ── Кога се е променило поведението (CUSUM) ──────────────────────────────────
// Най-ценният изход не е „сега е зле", а „стана зле в 03:14" — това се
// кръстосва с деплой/рестарт от одита и дава готова хипотеза за причина.
//
// ДВУСТРАНЕН. Едностранният вариант (само нагоре) не просто пропускаше спада —
// той връщаше УВЕРЕНО ГРЕШЕН отговор: при ред, който пада на средата, първата
// половина е над медианата, натрупването тръгва от индекс 0 и функцията
// съобщаваше „промяната е в самото начало". А спадът е точно толкова важен
// сигнал: изчезнал трафик, спрял процес, паднала честота на заявките — и той е
// това, което търсиш в „Разследване" след инцидент.
// Реализацията е УСТОЙЧИВО ТЪРСЕНЕ НА ПРОБИВ, не CUSUM. Пробвахме CUSUM и той се
// проваля тихо на точно този вид данни — ето защо, за да не бъде „опростен"
// обратно:
//
//  • С медиана на ЦЕЛИЯ ред за отправна точка стъпаловидната промяна поставя
//    медианата МЕЖДУ двете нива, значи и двете половини изглеждат отклонени.
//    Едностранният вариант съобщаваше „промяната е в самото начало" при спад;
//    двустранният сочеше обратната посока.
//  • С медиана на базов прозорец е още по-лошо: при чередуващи се 20/21 медианата
//    на нечетен прозорец е 20 вместо 20.5, натрупването „храпва" по половин
//    единица на стъпка и функцията ИЗМИСЛЯ инцидент в напълно спокоен ред
//    (хванато от тест).
//
// Затова: за всяко възможно място на разрез сравняваме медианата ПРЕДИ с
// медианата СЛЕД, мащабирано с разсейването вътре в двете части. Няма
// натрупване, значи няма и дрейф; посоката излиза сама от знака.
export function changePoint(rawPoints, { minShift = 3, minSegment = 8 } = {}) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 20) return null;
  const points = [...rawPoints].sort((a, b) => a.x - b.x);
  const values = points.map((p) => p.y);
  const n = values.length;
  if (n < minSegment * 2) return null;

  // Мястото на разреза се избира по НАЙ-МАЛКА остатъчна грешка (сума от
  // абсолютни отклонения около медианата на всяка част) — класическата
  // сегментация с най-малки абсолютни отклонения. Устойчива е на изключения и,
  // за разлика от „най-голямата разлика между медианите", НЕ се подвежда от
  // разрез в средата на едно ниво: там едната част остава с огромна вътрешна
  // грешка. (Първият ми опит мереше само разликата и MAD-ът на частите падаше
  // на нула винаги когато над половината стойности са еднакви — тогава всеки
  // разрез изглеждаше идеален и печелеше най-ранният.)
  const cost = (arr) => {
    const m = median(arr);
    let s = 0;
    for (const v of arr) s += Math.abs(v - m);
    return s;
  };
  let best = null;
  for (let t = minSegment; t <= n - minSegment; t++) {
    const before = values.slice(0, t);
    const after = values.slice(t);
    const c = cost(before) + cost(after);
    if (!best || c < best.cost) best = { t, cost: c, before, after };
  }
  if (!best) return null;

  // Чак СЕГА се пита „това изобщо промяна ли е": разликата между двете нива,
  // мащабирана с остатъчния шум ВЪТРЕ в частите.
  const mb = median(best.before);
  const ma = median(best.after);
  const diff = ma - mb;
  if (diff === 0) return null;
  // Мащабът на шума е СРЕДНОТО абсолютно отклонение (то вече е сметнато — това е
  // `best.cost`), НЕ медианното. При целочислени метрики (CPU %, броячи) над
  // половината остатъци са точно нула и MAD се срива до 0 — тогава всяко
  // чередуване 20/21 изглежда като идеална стъпка и функцията ИЗМИСЛЯ инцидент
  // в напълно спокоен ред (хванато от тест).
  const meanAbs = best.cost / n;
  const sigma = 1.2533 * meanAbs; // средно абс. отклонение → σ при нормален шум
  const score = sigma > 0 ? Math.abs(diff) / sigma : Infinity;
  if (score < minShift) return null;
  best.score = score;
  best.diff = diff;
  // Индексът е ПОСЛЕДНАТА точка от старото поведение — така „промяната е около
  // 03:14" сочи момента ПРЕДИ скока, който после се кръстосва с одита.
  const index = best.t - 1;
  return {
    index,
    at: new Date(points[index].x).toISOString(),
    // Запазено под старото име заради интерфейса; сега е сила на пробива в σ.
    cusum: Number.isFinite(best.score) ? Math.round(best.score * 100) / 100 : 999,
    score: Number.isFinite(best.score) ? Math.round(best.score * 100) / 100 : 999,
    direction: best.diff > 0 ? 'нагоре' : 'надолу',
  };
}

export function fmtDuration(ms) {
  const d = ms / 86400000;
  if (d >= 2) return `${plural(d.toFixed(1), 'ден', 'дни')}`;
  const h = ms / 3600000;
  if (h >= 2) return `${plural(h.toFixed(1), 'час', 'часа')}`;
  return `${Math.max(1, Math.round(ms / 60000))} мин`;
}
