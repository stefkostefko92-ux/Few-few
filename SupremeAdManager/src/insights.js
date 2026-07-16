// Синхронизация на метрики: дърпа вчера + днес за всяка публикувана кампания.
import { db, audit } from './db.js';
import { resolveConnector } from './connectors/base.js';

function dateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// Дневна серия за графиките (нулево-запълнена): campaignId=null → всички кампании.
export function dailySeries(campaignId, days = 14) {
  const rows = campaignId
    ? db
        .prepare(
          `SELECT date, SUM(spend) spend, SUM(conversions) conversions FROM metrics_daily
           WHERE campaign_id = ? AND date >= date('now', ?) GROUP BY date`
        )
        .all(campaignId, `-${days} days`)
    : db
        .prepare(
          `SELECT date, SUM(spend) spend, SUM(conversions) conversions FROM metrics_daily
           WHERE date >= date('now', ?) GROUP BY date`
        )
        .all(`-${days} days`);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dateStr(-i);
    const r = byDate.get(date);
    out.push({
      date,
      spend: Math.round((r?.spend || 0) * 100) / 100,
      conversions: Math.round((r?.conversions || 0) * 10) / 10,
    });
  }
  return out;
}

// Седмичен дайджест: 5-те унифицирани метрики (dbt_ad_reporting стандарта:
// spend/clicks/impressions/conversions/conversion_value) за последните 7 пълни дни
// срещу предходните 7 (същите дни от седмицата — сезонността се съкращава сама),
// + „какво се промени“ от одитната следа (change attribution, без магия).
export function weeklyDigest() {
  const win = (fromDays, toDays) =>
    db
      .prepare(
        `SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(clicks),0) clicks,
                COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(conversions),0) conversions,
                COALESCE(SUM(conversion_value),0) conversion_value
         FROM metrics_daily WHERE date >= date('now', ?) AND date < date('now', ?)`
      )
      .get(`-${fromDays} days`, `-${toDays} days`);
  const cur = win(7, 0);
  const prev = win(14, 7);

  const metric = (key, label, decimals = 2) => {
    const c = cur[key];
    const p = prev[key];
    return {
      key,
      label,
      current: Math.round(c * 10 ** decimals) / 10 ** decimals,
      previous: Math.round(p * 10 ** decimals) / 10 ** decimals,
      changePct: p > 0 ? Math.round((c / p - 1) * 1000) / 10 : null,
    };
  };
  const metrics = [
    metric('spend', 'Разход'),
    metric('impressions', 'Импресии', 0),
    metric('clicks', 'Кликове', 0),
    metric('conversions', 'Конверсии', 1),
    metric('conversion_value', 'Стойност'),
  ];

  // Топ/дъно кампании по разход за периода — къде отидоха парите.
  const perCampaign = db
    .prepare(
      `SELECT c.id, c.name, COALESCE(SUM(m.spend),0) spend, COALESCE(SUM(m.conversion_value),0) value,
              COALESCE(SUM(m.conversions),0) conversions
       FROM campaigns c JOIN metrics_daily m ON m.campaign_id = c.id
       WHERE m.date >= date('now', '-7 days') AND m.date < date('now')
       GROUP BY c.id HAVING spend > 0 ORDER BY spend DESC LIMIT 10`
    )
    .all()
    .map((r) => ({ ...r, roas: r.spend > 0 ? Math.round((r.value / r.spend) * 100) / 100 : null }));

  // „Промени и ефект“: какво направиха човекът/правилата/интелигентният слой тази седмица.
  const changes = db
    .prepare(
      `SELECT at, actor, campaign_id, action, detail_json FROM audit_log
       WHERE at >= datetime('now', '-7 days')
         AND action IN ('auto_pause','scale_budget','shrink_budget','budget_applied',
                        'campaign_active','campaign_paused','campaign_archived',
                        'anomaly','pacing_alert','policy_issue','notify')
       ORDER BY id DESC LIMIT 30`
    )
    .all();

  return { metrics, perCampaign, changes };
}

export async function syncMetrics() {
  const campaigns = db
    .prepare(
      `SELECT * FROM campaigns WHERE status IN ('active','paused','published') AND external_id IS NOT NULL`
    )
    .all();
  let synced = 0;
  for (const campaign of campaigns) {
    const conn = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(campaign.connection_id);
    try {
      const connector = await resolveConnector(campaign.platform, conn);

      // Policy/delivery проверка (тихият фал = неодобрена реклама, никой не гледа Ads Manager).
      const policy = await connector.fetchDeliveryIssues(campaign);
      const prev = campaign.policy_json ? JSON.parse(campaign.policy_json) : null;
      db.prepare(`UPDATE campaigns SET policy_json=? WHERE id=?`).run(
        JSON.stringify({ ...policy, checked_at: new Date().toISOString() }),
        campaign.id
      );
      if (policy.status === 'ISSUES' && prev?.status !== 'ISSUES') {
        audit('scheduler', 'policy_issue', {
          campaignId: campaign.id,
          detail: { issues: policy.issues },
        });
      }
      for (const date of [dateStr(-1), dateStr(0)]) {
        const m = await connector.fetchDailyMetrics(campaign, date);
        db.prepare(
          `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions, conversion_value, video_views, frequency)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(campaign_id, date) DO UPDATE SET
             impressions=excluded.impressions, clicks=excluded.clicks, spend=excluded.spend,
             conversions=excluded.conversions, conversion_value=excluded.conversion_value,
             video_views=excluded.video_views, frequency=excluded.frequency`
        ).run(
          campaign.id,
          date,
          m.impressions,
          m.clicks,
          m.spend,
          m.conversions,
          m.conversion_value,
          m.video_views,
          m.frequency
        );
      }
      synced++;
    } catch (err) {
      audit('scheduler', 'sync_error', {
        campaignId: campaign.id,
        detail: { error: String(err.message) },
      });
    }
  }
  return synced;
}
