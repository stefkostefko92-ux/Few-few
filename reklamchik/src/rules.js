// Двигател на правилата: метрика → условие → действие, с cooldown, минимален spend
// и твърди предпазители. Прагове по проучването (2026): pause при CPA>1.5-3× target
// (мин. 20+ конверсии/€100+ spend), scale +20% при ROAS>target 3+ дни, fatigue при
// frequency>3.5 / CTR −20%. Правилата НИКОГА не активират кампания в learning phase риск.
import { db, audit } from './db.js';
import { checkBudgetChange } from './guard.js';
import { resolveConnector } from './connectors/base.js';

// Изчислява агрегираните метрики на кампания за последните N дни.
export function aggregateMetrics(campaignId, lookbackDays) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(clicks),0) clicks,
              COALESCE(SUM(spend),0) spend, COALESCE(SUM(conversions),0) conversions,
              COALESCE(SUM(conversion_value),0) conversion_value, AVG(frequency) frequency
       FROM metrics_daily
       WHERE campaign_id = ? AND date >= date('now', ?)`
    )
    .get(campaignId, `-${lookbackDays} days`);
  const spendToday = db
    .prepare(
      `SELECT COALESCE(SUM(spend),0) s FROM metrics_daily WHERE campaign_id=? AND date=date('now')`
    )
    .get(campaignId).s;
  return {
    ...row,
    spend_today: spendToday,
    cpa: row.conversions > 0 ? row.spend / row.conversions : null,
    roas: row.spend > 0 ? row.conversion_value / row.spend : null,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
  };
}

function metricValue(agg, metric) {
  switch (metric) {
    case 'cpa':
      return agg.cpa;
    case 'roas':
      return agg.roas;
    case 'ctr':
      return agg.ctr;
    case 'spend_today':
      return agg.spend_today;
    case 'frequency':
      return agg.frequency;
    case 'conversions':
      return agg.conversions;
    default:
      return null;
  }
}

function compare(value, operator, threshold) {
  if (value == null) return false; // няма данни → никакво действие (шумът убива печеливши кампании)
  switch (operator) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    default:
      return false;
  }
}

function cooldownActive(rule) {
  if (!rule.last_fired_at) return false;
  const elapsed = Date.now() - new Date(rule.last_fired_at + 'Z').getTime();
  return elapsed < rule.cooldown_hours * 3600 * 1000;
}

// Изпълнява всички активни правила. Връща списък на изпълнените действия.
export async function runRules() {
  const rules = db.prepare(`SELECT * FROM rules WHERE enabled = 1`).all();
  const fired = [];

  for (const rule of rules) {
    if (cooldownActive(rule)) continue;

    const campaigns = rule.campaign_id
      ? db
          .prepare(`SELECT * FROM campaigns WHERE id = ? AND status IN ('active','paused')`)
          .all(rule.campaign_id)
      : db.prepare(`SELECT * FROM campaigns WHERE status IN ('active','paused')`).all();

    for (const campaign of campaigns) {
      const agg = aggregateMetrics(campaign.id, rule.lookback_days);
      // Минимален spend преди действие — без статистическа маса не пипаме нищо.
      if (agg.spend < rule.min_spend) continue;
      if (!compare(metricValue(agg, rule.metric), rule.operator, rule.threshold)) continue;

      const actor = `rule:${rule.id}`;
      try {
        const conn = db
          .prepare(`SELECT * FROM connections WHERE id = ?`)
          .get(campaign.connection_id);
        const connector = await resolveConnector(campaign.platform, conn);

        if (rule.action === 'pause' && campaign.status === 'active') {
          await connector.setStatus(campaign, 'PAUSED'); // PAUSED и за двете платформи
          db.prepare(
            `UPDATE campaigns SET status='paused', updated_at=datetime('now') WHERE id=?`
          ).run(campaign.id);
          audit(actor, 'auto_pause', {
            campaignId: campaign.id,
            detail: {
              metric: rule.metric,
              value: metricValue(agg, rule.metric),
              threshold: rule.threshold,
            },
          });
          fired.push({ rule: rule.name, campaign: campaign.name, action: 'pause' });
        } else if (rule.action === 'activate' && campaign.status === 'paused') {
          await connector.setStatus(
            campaign,
            campaign.platform === 'google' ? 'ENABLED' : 'ACTIVE'
          );
          db.prepare(
            `UPDATE campaigns SET status='active', updated_at=datetime('now') WHERE id=?`
          ).run(campaign.id);
          audit(actor, 'auto_activate', { campaignId: campaign.id });
          fired.push({ rule: rule.name, campaign: campaign.name, action: 'activate' });
        } else if (rule.action === 'scale_budget' || rule.action === 'shrink_budget') {
          const pct = Math.min(Math.abs(rule.action_value || 20), 20); // твърд таван ±20%/стъпка
          const factor = rule.action === 'scale_budget' ? 1 + pct / 100 : 1 - pct / 100;
          const newBudget = Math.round(campaign.daily_budget * factor * 100) / 100;
          const violations = checkBudgetChange(campaign, newBudget);
          if (violations.length) {
            audit(actor, 'budget_change_blocked', {
              campaignId: campaign.id,
              detail: { violations },
            });
            continue;
          }
          await connector.updateBudget(campaign, newBudget);
          db.prepare(
            `UPDATE campaigns SET daily_budget=?, updated_at=datetime('now') WHERE id=?`
          ).run(newBudget, campaign.id);
          audit(actor, rule.action, {
            campaignId: campaign.id,
            detail: { from: campaign.daily_budget, to: newBudget },
          });
          fired.push({
            rule: rule.name,
            campaign: campaign.name,
            action: `${rule.action} → ${newBudget}`,
          });
        } else if (rule.action === 'notify') {
          audit(actor, 'notify', {
            campaignId: campaign.id,
            detail: {
              metric: rule.metric,
              value: metricValue(agg, rule.metric),
              threshold: rule.threshold,
            },
          });
          fired.push({ rule: rule.name, campaign: campaign.name, action: 'notify' });
        } else {
          continue; // действие неприложимо за текущия статус
        }

        db.prepare(`UPDATE rules SET last_fired_at=datetime('now') WHERE id=?`).run(rule.id);
      } catch (err) {
        audit(actor, 'rule_error', {
          campaignId: campaign.id,
          detail: { error: String(err.message) },
        });
      }
    }
  }
  return fired;
}

// Стартов комплект правила по проучването — създава се еднократно за нова кампания по избор.
export const RECOMMENDED_RULES = [
  {
    name: 'Пауза при изгорял CPA',
    metric: 'cpa',
    operator: '>',
    thresholdHint: '2× целевия CPA',
    lookback_days: 7,
    min_spend: 100,
    action: 'pause',
    cooldown_hours: 24,
  },
  {
    name: 'Скалирай печеливша (+20%)',
    metric: 'roas',
    operator: '>',
    thresholdHint: 'целевия ROAS (напр. 3)',
    lookback_days: 7,
    min_spend: 100,
    action: 'scale_budget',
    action_value: 20,
    cooldown_hours: 72,
  },
  {
    name: 'Умора на креатива',
    metric: 'frequency',
    operator: '>',
    threshold: 3.5,
    lookback_days: 7,
    min_spend: 20,
    action: 'notify',
    cooldown_hours: 48,
  },
  {
    name: 'Дневен спирачен праг',
    metric: 'spend_today',
    operator: '>',
    thresholdHint: '1.5× дневния бюджет',
    lookback_days: 1,
    min_spend: 0,
    action: 'pause',
    cooldown_hours: 12,
  },
];
