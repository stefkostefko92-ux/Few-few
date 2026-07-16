// Интелигентен слой: аномалии + pacing + прогноза. Чиста математика върху metrics_daily,
// нула зависимости. Формулите са от OSS prior art (Apache-2.0/MIT — виж RESEARCH.md §7):
// - Аномалии: same-weekday базлайн (Google Account Anomaly Detector) + robust z-score
//   по Iglewicz–Hoaglin (MAD, праг 3.5) — един минал скок не отравя базлайна.
// - Pacing: LinkedIn KDD'14 правилото, пренесено на дневно ниво срещу месечен таван.
// - Прогноза: EWMA (α=0.3) с fallback, Holt-Winters-лека сезонност по ден от седмицата.
import { db } from './db.js';

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Robust z-score (Iglewicz–Hoaglin): z = 0.6745·(x − med)/MAD.
 * MAD floor: max(MAD, 5% от медианата, ε) — при малки числа MAD често е 0.
 */
export function robustZ(current, history) {
  const med = median(history);
  if (med == null) return null;
  const mad = median(history.map((v) => Math.abs(v - med)));
  const floor = Math.max(mad, 0.05 * Math.abs(med), 1e-9);
  return (0.6745 * (current - med)) / floor;
}

/**
 * Аномалии за (кампания, дата): сравнява всяка метрика със СЪЩИЯ ден от седмицата
 * за последните `weeks` седмици. Под за обем: median(impressions) > minImpressions —
 * иначе шумът доминира (Account Anomaly Detector практика).
 */
export function detectAnomalies(
  campaignId,
  dateStr,
  { weeks = 8, threshold = 3.5, minImpressions = 100 } = {}
) {
  const today = db
    .prepare(
      `SELECT impressions, clicks, spend, conversions FROM metrics_daily WHERE campaign_id=? AND date=?`
    )
    .get(campaignId, dateStr);
  if (!today) return [];

  const history = db
    .prepare(
      `SELECT impressions, clicks, spend, conversions FROM metrics_daily
       WHERE campaign_id=? AND strftime('%w', date)=strftime('%w', ?) AND date < ?
       ORDER BY date DESC LIMIT ?`
    )
    .all(campaignId, dateStr, dateStr, weeks);
  if (history.length < 3) return []; // без база няма присъда

  if ((median(history.map((h) => h.impressions)) ?? 0) < minImpressions) return [];

  const anomalies = [];
  for (const metric of ['spend', 'clicks', 'conversions', 'impressions']) {
    const z = robustZ(
      today[metric],
      history.map((h) => h[metric])
    );
    if (z != null && Math.abs(z) > threshold) {
      anomalies.push({
        metric,
        z: Math.round(z * 100) / 100,
        value: today[metric],
        baseline: median(history.map((h) => h[metric])),
        direction: z > 0 ? 'скок' : 'срив',
      });
    }
  }
  return anomalies;
}

/**
 * Месечен pacing (LinkedIn правилото на дневно ниво): target_to_date = B·elapsed/total.
 * Отклонение >±15% (ads-monitor праг) = аларма; дневният таргет за остатъка се
 * самокоригира: (B − похарчено)/оставащи дни. monthlyBudget=0 → изключено.
 */
export function monthlyPacing(monthlyBudget, now = new Date()) {
  if (!monthlyBudget || monthlyBudget <= 0) return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedDays = now.getUTCDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-%`;

  const spent = db
    .prepare(`SELECT COALESCE(SUM(spend),0) s FROM metrics_daily WHERE date LIKE ?`)
    .get(monthPrefix).s;

  const targetToDate = (monthlyBudget * elapsedDays) / totalDays;
  const remainingDays = Math.max(1, totalDays - elapsedDays);
  const deviation = targetToDate > 0 ? spent / targetToDate - 1 : 0;
  return {
    monthlyBudget,
    spent: Math.round(spent * 100) / 100,
    targetToDate: Math.round(targetToDate * 100) / 100,
    deviationPct: Math.round(deviation * 1000) / 10,
    over: deviation > 0.15,
    under: deviation < -0.15,
    dailyTargetRemaining: Math.round(((monthlyBudget - spent) / remainingDays) * 100) / 100,
    remainingDays,
  };
}

/**
 * Свръхдоставка: платформите могат легално да похарчат до 2× дневния бюджет в един ден.
 * Връща дните от последните lookback, в които spend > 2× дневния бюджет.
 */
export function overdeliveryDays(campaignId, dailyBudget, lookbackDays = 7) {
  return db
    .prepare(
      `SELECT date, spend FROM metrics_daily
       WHERE campaign_id=? AND date >= date('now', ?) AND spend > ?
       ORDER BY date DESC`
    )
    .all(campaignId, `-${lookbackDays} days`, dailyBudget * 2);
}

/**
 * 7-дневна прогноза на разход: сезонност по ден от седмицата (средно на последните
 * 4 стойности за същия ден) + EWMA ниво за тренд. При <2 седмици история → EWMA плоска.
 */
export function forecastSpend(campaignId, days = 7) {
  const rows = db
    .prepare(
      `SELECT date, spend FROM metrics_daily WHERE campaign_id=? ORDER BY date DESC LIMIT 28`
    )
    .all(campaignId)
    .reverse();
  if (rows.length < 7) return null;

  // EWMA ниво (α=0.3)
  let level = rows[0].spend;
  for (const r of rows) level = 0.3 * r.spend + 0.7 * level;

  // Сезонни фактори по ден от седмицата (адитивни, спрямо общото средно)
  const mean = rows.reduce((s, r) => s + r.spend, 0) / rows.length;
  const byDow = new Map();
  for (const r of rows) {
    const dow = new Date(r.date + 'T00:00:00Z').getUTCDay();
    if (!byDow.has(dow)) byDow.set(dow, []);
    byDow.get(dow).push(r.spend);
  }
  const seasonal = new Map();
  for (const [dow, vals] of byDow) {
    seasonal.set(dow, vals.reduce((s, v) => s + v, 0) / vals.length - mean);
  }

  const lastDate = new Date(rows[rows.length - 1].date + 'T00:00:00Z');
  const out = [];
  for (let h = 1; h <= days; h++) {
    const d = new Date(lastDate.getTime() + h * 86400000);
    const s = seasonal.get(d.getUTCDay()) ?? 0;
    out.push({
      date: d.toISOString().slice(0, 10),
      spend: Math.max(0, Math.round((level + s) * 100) / 100),
    });
  }
  return { forecast: out, total: Math.round(out.reduce((s, f) => s + f.spend, 0) * 100) / 100 };
}
