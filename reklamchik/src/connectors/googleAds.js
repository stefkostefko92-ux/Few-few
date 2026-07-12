// Google Ads API connector — REST (googleads.googleapis.com), без тежки SDK зависимости.
// Всяка нова кампания се създава PAUSED — активирането е винаги съзнателно действие.
// Документация: https://developers.google.com/google-ads/api/rest/overview
import { config } from '../config.js';
import { decrypt, encrypt } from '../crypto.js';
import { db, audit } from '../db.js';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleAdsConnector {
  constructor(connection) {
    this.conn = connection;
    this.customerId = connection.external_account_id.replace(/-/g, '');
    this.base = `https://googleads.googleapis.com/${config.google.apiVersion}`;
  }

  async accessToken() {
    // Кеширан access token, обновяван през refresh token при изтичане.
    const now = Date.now();
    if (
      this.conn.access_token_enc &&
      this.conn.token_expires_at &&
      new Date(this.conn.token_expires_at).getTime() - 60_000 > now
    ) {
      return decrypt(this.conn.access_token_enc);
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        refresh_token: decrypt(this.conn.refresh_token_enc),
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok)
      throw new Error(`Google OAuth refresh неуспешен: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const expiresAt = new Date(now + data.expires_in * 1000).toISOString();
    db.prepare(`UPDATE connections SET access_token_enc=?, token_expires_at=? WHERE id=?`).run(
      encrypt(data.access_token),
      expiresAt,
      this.conn.id
    );
    this.conn.access_token_enc = encrypt(data.access_token);
    this.conn.token_expires_at = expiresAt;
    return data.access_token;
  }

  async headers() {
    const h = {
      authorization: `Bearer ${await this.accessToken()}`,
      'developer-token': config.google.developerToken,
      'content-type': 'application/json',
    };
    if (config.google.loginCustomerId) h['login-customer-id'] = config.google.loginCustomerId;
    return h;
  }

  async post(path, body) {
    const res = await fetch(`${this.base}/${path}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      throw new Error(`Google Ads API ${res.status}: ${msg}`);
    }
    return data;
  }

  channelType(objective) {
    // ВАЖНО: класически VIDEO кампании са READ-ONLY през Google Ads API
    // (https://developers.google.com/google-ads/api/docs/video/overview).
    // YouTube (вкл. in-stream/in-feed/Shorts) се пуска през DEMAND_GEN — затова VIDEO → DEMAND_GEN.
    return (
      {
        SEARCH: 'SEARCH',
        PERFORMANCE_MAX: 'PERFORMANCE_MAX',
        DEMAND_GEN: 'DEMAND_GEN',
        VIDEO: 'DEMAND_GEN',
        DISPLAY: 'DISPLAY',
      }[objective] || 'SEARCH'
    );
  }

  biddingField(campaign) {
    // Опростено покритие на основните стратегии; стойностите са в micros.
    const t = campaign.bidding_target;
    switch (campaign.bidding) {
      case 'tCPA':
        return { targetCpa: { targetCpaMicros: String(Math.round(t * 1e6)) } };
      case 'tROAS':
        return { targetRoas: { targetRoas: t } };
      case 'MAX_CLICKS':
        return { targetSpend: {} };
      case 'CPV':
        return { targetCpv: {} }; // VIDEO
      default:
        return { maximizeConversions: {} };
    }
  }

  async publishCampaign(campaign) {
    // 1) Бюджетът е отделен ресурс (CampaignBudget), после кампанията сочи към него.
    const budgetRes = await this.post(`customers/${this.customerId}/campaignBudgets:mutate`, {
      operations: [
        {
          create: {
            name: `${campaign.name} · бюджет · ${Date.now()}`,
            amountMicros: String(Math.round(campaign.daily_budget * 1e6)),
            deliveryMethod: 'STANDARD',
            explicitlyShared: false,
          },
        },
      ],
    });
    const budgetResource = budgetRes.results[0].resourceName;

    // 2) Кампания — ВИНАГИ PAUSED при създаване (безопасност по подразбиране).
    const spec = JSON.parse(campaign.spec_json || '{}');
    const create = {
      name: campaign.name,
      status: 'PAUSED',
      advertisingChannelType: this.channelType(campaign.objective),
      campaignBudget: budgetResource,
      // Задължителна декларация по EU регламента за политическа реклама (v23+).
      containsEuPoliticalAdvertising: spec.eu_political
        ? 'CONTAINS_EU_POLITICAL_ADVERTISING'
        : 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      ...this.biddingField(campaign),
    };
    const campRes = await this.post(`customers/${this.customerId}/campaigns:mutate`, {
      operations: [{ create }],
    });
    const resourceName = campRes.results[0].resourceName; // customers/X/campaigns/Y
    const externalId = resourceName.split('/').pop();
    audit('admin', 'publish_campaign:google', {
      campaignId: campaign.id,
      detail: { resourceName },
    });
    return { externalId, status: 'PAUSED' };
  }

  async setStatus(campaign, status) {
    // status: ENABLED | PAUSED
    await this.post(`customers/${this.customerId}/campaigns:mutate`, {
      operations: [
        {
          update: {
            resourceName: `customers/${this.customerId}/campaigns/${campaign.external_id}`,
            status,
          },
          updateMask: 'status',
        },
      ],
    });
    return { ok: true };
  }

  async updateBudget(campaign, newBudget) {
    // Взимаме бюджетния ресурс на кампанията през GAQL, после го мутираме.
    const q = await this.post(`customers/${this.customerId}/googleAds:search`, {
      query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${Number(campaign.external_id)}`,
    });
    const budgetResource = q.results?.[0]?.campaign?.campaignBudget;
    if (!budgetResource) throw new Error('бюджетният ресурс не е намерен');
    await this.post(`customers/${this.customerId}/campaignBudgets:mutate`, {
      operations: [
        {
          update: {
            resourceName: budgetResource,
            amountMicros: String(Math.round(newBudget * 1e6)),
          },
          updateMask: 'amount_micros',
        },
      ],
    });
    return { ok: true };
  }

  async fetchDailyMetrics(campaign, dateStr) {
    const q = await this.post(`customers/${this.customerId}/googleAds:search`, {
      query: `
        SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.conversions_value, metrics.video_views
        FROM campaign
        WHERE campaign.id = ${Number(campaign.external_id)}
          AND segments.date = '${dateStr}'`,
    });
    const m = q.results?.[0]?.metrics || {};
    return {
      impressions: Number(m.impressions || 0),
      clicks: Number(m.clicks || 0),
      spend: Number(m.costMicros || 0) / 1e6,
      conversions: Number(m.conversions || 0),
      conversion_value: Number(m.conversionsValue || 0),
      video_views: Number(m.videoViews || 0),
      frequency: null, // Google не дава frequency на кампанийно ниво в тази заявка
    };
  }
}
