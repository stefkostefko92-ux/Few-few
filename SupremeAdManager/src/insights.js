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
