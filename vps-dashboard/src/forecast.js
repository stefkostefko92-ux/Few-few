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
export function forecastToLimit(points, limit, { minPoints = 8, maxHorizonMs = 90 * 86400000 } = {}) {
  if (!Array.isArray(points) || points.length < minPoints) {
    return { ok: false, reason: 'малко данни' };
  }
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
export function changePoint(points, { k = 0.5, h = 5 } = {}) {
  if (points.length < 20) return null;
  const values = points.map((p) => p.y);
  const med = median(values);
  const m = mad(values, med);
  if (!m) return null;
  const sigma = 1.4826 * m;
  let sPos = 0;
  let lastZero = 0;
  for (let i = 0; i < values.length; i++) {
    const s = (values[i] - med) / sigma;
    sPos = Math.max(0, sPos + s - k);
    if (sPos === 0) lastZero = i;
    if (sPos > h) {
      return { index: lastZero, at: new Date(points[lastZero].x).toISOString(), cusum: sPos };
    }
  }
  return null;
}

export function fmtDuration(ms) {
  const d = ms / 86400000;
  if (d >= 2) return `${d.toFixed(1)} дни`;
  const h = ms / 3600000;
  if (h >= 2) return `${h.toFixed(1)} часа`;
  return `${Math.max(1, Math.round(ms / 60000))} мин`;
}
