// Синхронизация на метрики: дърпа вчера + днес за всяка публикувана кампания.
import { db, audit } from './db.js';
import { resolveConnector } from './connectors/base.js';

function dateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
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
