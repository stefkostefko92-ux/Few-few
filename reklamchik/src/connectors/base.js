// Общ интерфейс на connector + dry-run симулатор.
// Всеки connector реализира: publishCampaign, setStatus, updateBudget, fetchDailyMetrics.
// В dry-run всичко се симулира детерминистично — приложението е напълно използваемо без креденшъли.
import crypto from 'node:crypto';
import { isDryRun } from '../config.js';
import { audit } from '../db.js';

export class DryRunConnector {
  constructor(platform) {
    this.platform = platform;
  }

  publishCampaign(campaign) {
    const externalId = `dry_${this.platform}_${crypto.randomBytes(4).toString('hex')}`;
    audit('scheduler', 'publish_campaign(dry-run)', {
      campaignId: campaign.id,
      detail: { externalId },
      dryRun: true,
    });
    return Promise.resolve({ externalId, status: 'PAUSED' });
  }

  setStatus(campaign, status) {
    audit('scheduler', `set_status(dry-run):${status}`, { campaignId: campaign.id, dryRun: true });
    return Promise.resolve({ ok: true });
  }

  updateBudget(campaign, newBudget) {
    audit('scheduler', 'update_budget(dry-run)', {
      campaignId: campaign.id,
      detail: { from: campaign.daily_budget, to: newBudget },
      dryRun: true,
    });
    return Promise.resolve({ ok: true });
  }

  // Симулирани, но правдоподобни метрики: детерминистични по (кампания, дата),
  // мащабирани по бюджет — за да могат правилата/дашбордът да се тестват реалистично.
  fetchDailyMetrics(campaign, dateStr) {
    const seed = crypto.createHash('sha256').update(`${campaign.id}:${dateStr}`).digest();
    const rnd = (i, min, max) => min + (seed[i] / 255) * (max - min);
    const budget = campaign.daily_budget;
    const spend = Math.min(budget, budget * rnd(0, 0.75, 1.0));
    const cpm = rnd(1, 2.5, 12); // €/1000 импресии
    const impressions = Math.round((spend / cpm) * 1000);
    const ctr = rnd(2, 0.006, 0.025);
    const clicks = Math.round(impressions * ctr);
    const cvr = rnd(3, 0.01, 0.05);
    const conversions = Math.round(clicks * cvr * 100) / 100;
    const aov = rnd(4, 20, 80);
    return Promise.resolve({
      impressions,
      clicks,
      spend: Math.round(spend * 100) / 100,
      conversions,
      conversion_value: Math.round(conversions * aov * 100) / 100,
      video_views: Math.round(impressions * rnd(5, 0.1, 0.4)),
      frequency: Math.round(rnd(6, 1.0, 3.5) * 100) / 100,
    });
  }
}

export function connectorFor(platform, connection) {
  if (isDryRun() || !connection?.refresh_token_enc) return new DryRunConnector(platform);
  // Ленивите import-и избягват цикли и държат dry-run пътя нулево-зависим.
  if (platform === 'google') {
    return import('./googleAds.js').then((m) => new m.GoogleAdsConnector(connection));
  }
  if (platform === 'meta') {
    return import('./metaAds.js').then((m) => new m.MetaAdsConnector(connection));
  }
  throw new Error(`непозната платформа: ${platform}`);
}

// Унифицирано взимане (connectorFor може да върне Promise при реален connector).
export async function resolveConnector(platform, connection) {
  return await connectorFor(platform, connection);
}
