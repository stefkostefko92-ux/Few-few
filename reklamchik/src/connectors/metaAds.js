// Meta Marketing API connector — директни Graph API заявки (npm SDK изостава от API версиите).
// Покрива Facebook / Instagram / Threads / Messenger placements + Click-to-WhatsApp.
// Всяка нова кампания се създава PAUSED — активирането е винаги съзнателно действие.
// Документация: https://developers.facebook.com/docs/marketing-apis
import { config } from '../config.js';
import { decrypt } from '../crypto.js';
import { audit } from '../db.js';

export class MetaAdsConnector {
  constructor(connection) {
    this.conn = connection;
    // external_account_id се пази като act_<id>
    this.accountId = connection.external_account_id.startsWith('act_')
      ? connection.external_account_id
      : `act_${connection.external_account_id}`;
    this.base = `https://graph.facebook.com/${config.meta.apiVersion}`;
  }

  token() {
    // System User token (дълготраен) — пази се криптиран в refresh_token_enc.
    return decrypt(this.conn.refresh_token_enc);
  }

  async call(method, path, params = {}) {
    const url = new URL(`${this.base}/${path}`);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    // Токенът върви в Authorization header, НЕ в URL — URL-ите попадат в proxy/APM логове.
    const headers = { authorization: `Bearer ${this.token()}` };
    let res;
    if (method === 'GET') {
      url.search = body.toString();
      res = await fetch(url, { headers });
    } else {
      res = await fetch(url, { method, body, headers });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const e = data.error || {};
      // код 17/613/80004 = rate limit → извикващият може да retry-не с backoff
      const err = new Error(`Meta API ${e.code || res.status}: ${e.message || res.statusText}`);
      err.code = e.code;
      err.retryable = [17, 613, 80004, 4].includes(e.code);
      throw err;
    }
    return data;
  }

  publisherPlatforms(spec) {
    // Поддържани: facebook, instagram, messenger, audience_network, threads.
    // Правило (Meta docs): threads изисква instagram да присъства в publisher_platforms.
    const p = spec.placements?.length ? [...spec.placements] : ['facebook', 'instagram'];
    if (p.includes('threads') && !p.includes('instagram')) p.push('instagram');
    return p;
  }

  async publishCampaign(campaign) {
    const spec = JSON.parse(campaign.spec_json || '{}');

    // 1) Кампания (ODAX objective) — PAUSED. special_ad_categories е задължително поле.
    const camp = await this.call('POST', `${this.accountId}/campaigns`, {
      name: campaign.name,
      objective: campaign.objective,
      status: 'PAUSED',
      special_ad_categories: JSON.parse(campaign.special_ad_categories || '[]'),
      // Advantage+ campaign budget (CBO) на ниво кампания:
      daily_budget: Math.round(campaign.daily_budget * 100), // в минорни единици (стотинки)
    });

    // 2) AdSet — таргетиране + placements. Advantage+ audience по подразбиране (broad).
    const targeting = {
      geo_locations: { countries: spec.geo?.length ? spec.geo : ['BG'] },
      age_min: Math.max(18, Number(spec.age_min ?? 18)), // guard.js вече е спрял <18 профилиране
      // v23.0+: при създаване на adset advantage_audience трябва да е изрично 0/1.
      targeting_automation: { advantage_audience: spec.advantage_audience === false ? 0 : 1 },
    };
    // Advantage+ placements = пропускаме publisher_platforms (automatic). Задаваме ги
    // само при изричен ръчен избор (напр. Threads-only тест).
    if (spec.placements?.length) targeting.publisher_platforms = this.publisherPlatforms(spec);
    if (spec.age_max) targeting.age_max = Number(spec.age_max);

    const adsetParams = {
      name: `${campaign.name} · adset`,
      campaign_id: camp.id,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: spec.optimization_goal || this.defaultGoal(campaign.objective),
      targeting,
      // DSA (ЕС, задължително от 16.08.2023): кой плаща и кой е бенефициент на рекламата.
      ...(spec.dsa_payor
        ? { dsa_payor: spec.dsa_payor, dsa_beneficiary: spec.dsa_beneficiary || spec.dsa_payor }
        : {}),
    };
    // Click-to-WhatsApp: destination_type + page с вързан WhatsApp Business номер.
    if (spec.whatsapp && spec.page_id) {
      adsetParams.destination_type = 'WHATSAPP';
      adsetParams.promoted_object = { page_id: spec.page_id };
    } else if (adsetParams.optimization_goal === 'OFFSITE_CONVERSIONS' && spec.pixel_id) {
      // OFFSITE_CONVERSIONS изисква promoted_object: pixel + събитие (immutable след create).
      adsetParams.promoted_object = {
        pixel_id: spec.pixel_id,
        custom_event_type: spec.custom_event_type || 'PURCHASE',
      };
    }
    const adset = await this.call('POST', `${this.accountId}/adsets`, adsetParams);

    // 3) Креатив + Ad (ако има текстов креатив и page_id).
    if (spec.page_id && spec.final_url) {
      // CTWA: линкът е https://api.whatsapp.com/send + CTA WHATSAPP_MESSAGE (Meta docs).
      const linkData = spec.whatsapp
        ? {
            link: 'https://api.whatsapp.com/send',
            message: spec.primary_text || '',
            name: spec.headline || campaign.name,
            call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
            ...(spec.page_welcome_message
              ? { page_welcome_message: spec.page_welcome_message }
              : {}),
          }
        : {
            link: spec.final_url,
            message: spec.primary_text || '',
            name: spec.headline || campaign.name,
            call_to_action: { type: 'LEARN_MORE' },
          };
      const creative = await this.call('POST', `${this.accountId}/adcreatives`, {
        name: `${campaign.name} · creative`,
        object_story_spec: { page_id: spec.page_id, link_data: linkData },
      });
      await this.call('POST', `${this.accountId}/ads`, {
        name: `${campaign.name} · ad`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      });
    }

    audit('admin', 'publish_campaign:meta', {
      campaignId: campaign.id,
      detail: { campaign_id: camp.id, adset_id: adset.id },
    });
    return { externalId: camp.id, status: 'PAUSED' };
  }

  defaultGoal(objective) {
    return (
      {
        OUTCOME_TRAFFIC: 'LINK_CLICKS',
        OUTCOME_SALES: 'OFFSITE_CONVERSIONS',
        OUTCOME_LEADS: 'LEAD_GENERATION',
        OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
        OUTCOME_AWARENESS: 'REACH',
        OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
      }[objective] || 'LINK_CLICKS'
    );
  }

  async setStatus(campaign, status) {
    // status: ACTIVE | PAUSED. Meta доставя само когато campaign И adset И ad са ACTIVE
    // (най-рестриктивното ниво печели) → каскадираме до цялата йерархия.
    await this.call('POST', `${campaign.external_id}`, { status });
    const adsets = await this.call('GET', `${campaign.external_id}/adsets`, { fields: 'id' });
    for (const adset of adsets.data || []) {
      await this.call('POST', adset.id, { status });
      const ads = await this.call('GET', `${adset.id}/ads`, { fields: 'id' });
      for (const ad of ads.data || []) {
        await this.call('POST', ad.id, { status });
      }
    }
    return { ok: true };
  }

  async updateBudget(campaign, newBudget) {
    await this.call('POST', `${campaign.external_id}`, {
      daily_budget: Math.round(newBudget * 100),
    });
    return { ok: true };
  }

  async fetchDailyMetrics(campaign, dateStr) {
    const data = await this.call('GET', `${campaign.external_id}/insights`, {
      time_range: { since: dateStr, until: dateStr },
      fields:
        'impressions,clicks,spend,actions,action_values,frequency,video_thruplay_watched_actions',
    });
    const row = data.data?.[0] || {};
    const actionCount = (type) =>
      Number((row.actions || []).find((a) => a.action_type === type)?.value || 0);
    const actionValue = (type) =>
      Number((row.action_values || []).find((a) => a.action_type === type)?.value || 0);
    return {
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      spend: Number(row.spend || 0),
      conversions:
        actionCount('purchase') +
        actionCount('lead') +
        actionCount('offsite_conversion.fb_pixel_purchase'),
      conversion_value:
        actionValue('purchase') + actionValue('offsite_conversion.fb_pixel_purchase'),
      video_views: Number((row.video_thruplay_watched_actions || [])[0]?.value || 0),
      frequency: row.frequency ? Number(row.frequency) : null,
    };
  }
}
