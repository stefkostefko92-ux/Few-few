// Бюджетен оптимизатор: Thompson sampling (Beta-Bernoulli) върху конверсионните
// проценти на кампаниите → ПРЕПОРЪКА как да се преразпредели общият дневен бюджет.
// САМО препоръки — прилагането е отделно човешко действие през checkBudgetChange
// (±20%/стъпка, тавани). Идеята е от OSS prior art (вж. RESEARCH.md §7): байесовият
// подход дава повече тежест на кампании с доказани конверсии, но оставя шанс и на
// новите (exploration), вместо да гони вчерашния шум.
import { db } from './db.js';
import { config } from './config.js';

// Детерминистичен PRNG (mulberry32) — инжектируем в тестовете; в UI сеемe от часовника.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Гама по Marsaglia–Tsang (2000); за shape<1 — стандартният boost Gamma(a+1)·U^(1/a).
function randGamma(shape, rng) {
  if (shape < 1) {
    const u = Math.max(rng(), 1e-12);
    return randGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      // Box–Muller за нормално разпределена стъпка
      const u1 = Math.max(rng(), 1e-12);
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(rng(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export function randBeta(alpha, beta, rng) {
  const x = randGamma(alpha, rng);
  const y = randGamma(beta, rng);
  return x / (x + y);
}

/**
 * Препоръки за преразпределение на общия дневен бюджет между активните кампании.
 * Prior: акаунтният CVR с ~20 псевдо-клика (informative, но лесно надвиваем от данни).
 * Оценка на кампания в едно теглене: θ·v̄·(clicks/spend) = очаквана стойност на €1.
 * Клампове: ±20% спрямо текущия бюджет (същият закон като checkBudgetChange) + таваните.
 */
export function recommendBudgets({ lookbackDays = 30, draws = 500, rng = null } = {}) {
  const random = rng || mulberry32((Date.now() % 2147483647) ^ 0x5ad);
  const campaigns = db
    .prepare(
      `SELECT c.id, c.name, c.daily_budget, c.currency,
              COALESCE(SUM(m.clicks),0) clicks, COALESCE(SUM(m.conversions),0) conversions,
              COALESCE(SUM(m.spend),0) spend, COALESCE(SUM(m.conversion_value),0) value
       FROM campaigns c
       LEFT JOIN metrics_daily m ON m.campaign_id = c.id AND m.date >= date('now', ?)
       WHERE c.status = 'active'
       GROUP BY c.id ORDER BY c.id`
    )
    .all(`-${lookbackDays} days`);

  // Причините са i18n ключове (opt.*) — изгледът ги превежда; одитът не ги ползва.
  const eligible = campaigns.filter((c) => c.clicks >= 10 && c.spend > 0);
  const skipped = campaigns
    .filter((c) => !(c.clicks >= 10 && c.spend > 0))
    .map((c) => ({ id: c.id, name: c.name, reasonKey: 'opt.skipNoBase' }));
  if (eligible.length < 2) {
    return { rows: [], skipped, lookbackDays, draws, reasonKey: 'opt.needTwo' };
  }

  // Акаунтен prior: CVR от всички кампании, с тегло ~20 псевдо-клика.
  const totClicks = eligible.reduce((s, c) => s + c.clicks, 0);
  const totConv = eligible.reduce((s, c) => s + c.conversions, 0);
  const cvr0 = totClicks > 0 ? Math.min(0.5, Math.max(0.001, totConv / totClicks)) : 0.02;
  const pseudo = 20;
  const alpha0 = cvr0 * pseudo;
  const beta0 = (1 - cvr0) * pseudo;
  const accountAov = totConv > 0 ? eligible.reduce((s, c) => s + c.value, 0) / totConv : 30;

  const shareSum = new Array(eligible.length).fill(0);
  const winCount = new Array(eligible.length).fill(0);
  for (let d = 0; d < draws; d++) {
    const scores = eligible.map((c) => {
      const conv = Math.min(c.conversions, c.clicks); // защита срещу view-through аномалии
      const theta = randBeta(alpha0 + conv, beta0 + Math.max(c.clicks - conv, 0.001), random);
      const aov = c.conversions > 0 ? c.value / c.conversions : accountAov;
      return theta * aov * (c.clicks / Math.max(c.spend, 0.01));
    });
    const sum = scores.reduce((s, v) => s + v, 0) || 1;
    let best = 0;
    scores.forEach((s, i) => {
      shareSum[i] += s / sum;
      if (s > scores[best]) best = i;
    });
    winCount[best]++;
  }

  const pool = eligible.reduce((s, c) => s + c.daily_budget, 0);
  const rows = eligible.map((c, i) => {
    const share = shareSum[i] / draws;
    const raw = pool * share;
    const recommended = Math.min(
      Math.max(raw, c.daily_budget * 0.8),
      c.daily_budget * 1.2,
      config.guards.maxDailyBudget
    );
    const rounded = Math.round(recommended * 100) / 100;
    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      current: c.daily_budget,
      recommended: rounded,
      deltaPct: Math.round((rounded / c.daily_budget - 1) * 1000) / 10,
      share: Math.round(share * 1000) / 10,
      winProb: Math.round((winCount[i] / draws) * 1000) / 10,
      clicks: c.clicks,
      conversions: c.conversions,
      spend: Math.round(c.spend * 100) / 100,
      roas: c.spend > 0 ? Math.round((c.value / c.spend) * 100) / 100 : null,
    };
  });
  rows.sort((a, b) => b.winProb - a.winProb);
  return { rows, skipped, lookbackDays, draws, pool: Math.round(pool * 100) / 100 };
}
