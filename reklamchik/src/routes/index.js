import express from 'express';
import { db, audit } from '../db.js';
import { config } from '../config.js';
import { encrypt } from '../crypto.js';
import { createSession, destroySession, requireAuth, verifyLogin } from '../auth.js';
import { checkCampaign, GuardError } from '../guard.js';
import { resolveConnector } from '../connectors/base.js';
import { aggregateMetrics, RECOMMENDED_RULES } from '../rules.js';
import { dailySeries } from '../insights.js';
import { tick } from '../scheduler.js';

export const router = express.Router();

// ---------- Вход/изход ----------
router.get('/login', (req, res) => res.render('login', { title: 'Вход', error: null }));

router.post('/login', (req, res) => {
  if (verifyLogin(req.body.email || '', req.body.password || '')) {
    createSession(res);
    return res.redirect('/');
  }
  res.status(401).render('login', { title: 'Вход', error: 'Грешен имейл или парола.' });
});

router.post('/logout', (req, res) => {
  destroySession(res);
  res.redirect('/login');
});

router.use(requireAuth);

// ---------- Дашборд ----------
router.get('/', (req, res) => {
  const campaigns = db.prepare(`SELECT * FROM campaigns ORDER BY created_at DESC`).all();
  const enriched = campaigns.map((c) => ({ ...c, agg: aggregateMetrics(c.id, 7) }));
  const totals = enriched.reduce(
    (t, c) => ({
      spend: t.spend + (c.agg.spend || 0),
      conversions: t.conversions + (c.agg.conversions || 0),
      value: t.value + (c.agg.conversion_value || 0),
      clicks: t.clicks + (c.agg.clicks || 0),
    }),
    { spend: 0, conversions: 0, value: 0, clicks: 0 }
  );
  const recentAudit = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 12`).all();
  res.render('dashboard', {
    title: 'Дашборд',
    campaigns: enriched,
    totals,
    recentAudit,
    series: dailySeries(null, 14),
  });
});

// ---------- Връзки ----------
router.get('/connections', (req, res) => {
  const connections = db
    .prepare(
      `SELECT id, platform, label, external_account_id, currency, status, created_at FROM connections ORDER BY id`
    )
    .all();
  res.render('connections', { title: 'Връзки', connections, error: null });
});

router.post('/connections', (req, res) => {
  const { platform, label, account_id, currency, token } = req.body;
  if (!['google', 'meta'].includes(platform) || !label || !account_id) {
    return res.status(400).render('connections', {
      title: 'Връзки',
      connections: db
        .prepare(
          `SELECT id, platform, label, external_account_id, currency, status, created_at FROM connections ORDER BY id`
        )
        .all(),
      error: 'Платформа, име и ID на акаунт са задължителни.',
    });
  }
  db.prepare(
    `INSERT INTO connections (platform, label, external_account_id, currency, refresh_token_enc)
     VALUES (?,?,?,?,?)
     ON CONFLICT(platform, external_account_id) DO UPDATE SET label=excluded.label, status='active'`
  ).run(
    platform,
    label,
    account_id.trim(),
    currency || 'EUR',
    token ? encrypt(token.trim()) : null
  );
  audit('admin', 'connection_saved', { detail: { platform, account_id } });
  res.redirect('/connections');
});

router.post('/connections/:id/revoke', (req, res) => {
  db.prepare(
    `UPDATE connections SET status='revoked', refresh_token_enc=NULL, access_token_enc=NULL WHERE id=?`
  ).run(req.params.id);
  audit('admin', 'connection_revoked', { detail: { id: req.params.id } });
  res.redirect('/connections');
});

// ---------- Кампании ----------
router.get('/campaigns/new', (req, res) => {
  const connections = db
    .prepare(`SELECT * FROM connections WHERE status='active' ORDER BY id`)
    .all();
  res.render('campaign-new', {
    title: 'Нова кампания',
    connections,
    error: null,
    guards: config.guards,
  });
});

router.post('/campaigns', (req, res) => {
  const b = req.body;
  const connection = db.prepare(`SELECT * FROM connections WHERE id=?`).get(b.connection_id);
  const connections = db
    .prepare(`SELECT * FROM connections WHERE status='active' ORDER BY id`)
    .all();
  const fail = (msg) =>
    res.status(400).render('campaign-new', {
      title: 'Нова кампания',
      connections,
      error: msg,
      guards: config.guards,
    });

  if (!connection) return fail('Избери валидна връзка (акаунт).');
  if (!b.name?.trim()) return fail('Името е задължително.');

  const spec = {
    final_url: b.final_url?.trim() || '',
    geo: (b.geo || 'BG')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    age_min: Number(b.age_min || 18),
    age_max: b.age_max ? Number(b.age_max) : undefined,
    placements: b.placements ? [].concat(b.placements) : [],
    whatsapp: b.whatsapp === 'on',
    page_id: b.page_id?.trim() || undefined,
    pixel_id: b.pixel_id?.trim() || undefined,
    headline: b.headline?.trim() || '',
    primary_text: b.primary_text?.trim() || '',
    dsa_payor: b.dsa_payor?.trim() || undefined,
    dsa_beneficiary: b.dsa_beneficiary?.trim() || undefined,
    consent_confirmed: b.consent_confirmed === 'on',
    ai_disclosure_confirmed: b.ai_disclosure_confirmed === 'on',
    eu_political: false, // политическа реклама не се поддържа от приложението
  };

  const campaign = {
    connection_id: connection.id,
    name: b.name.trim(),
    platform: connection.platform,
    objective: b.objective,
    daily_budget: Number(b.daily_budget || 0),
    currency: connection.currency,
    bidding: b.bidding || null,
    bidding_target: b.bidding_target ? Number(b.bidding_target) : null,
    spec_json: JSON.stringify(spec),
    special_ad_categories: JSON.stringify(
      b.special_ad_categories ? [].concat(b.special_ad_categories) : []
    ),
    ai_generated_creative: b.ai_generated_creative === 'on' ? 1 : 0,
  };

  const violations = checkCampaign(campaign);
  if (violations.length) return fail(violations.join(' · '));

  const info = db
    .prepare(
      `INSERT INTO campaigns (connection_id, name, platform, objective, daily_budget, currency, bidding, bidding_target, spec_json, special_ad_categories, ai_generated_creative)
       VALUES (@connection_id, @name, @platform, @objective, @daily_budget, @currency, @bidding, @bidding_target, @spec_json, @special_ad_categories, @ai_generated_creative)`
    )
    .run(campaign);
  audit('admin', 'campaign_created', { campaignId: info.lastInsertRowid });
  // GDPR чл. 7(1) отчетност: consent декларацията се логва (кой, кога, за кой домейн).
  // ВАЖНО: това е декларация на оператора — реалното съгласие се доказва на самия сайт (CMP/Consent Mode v2).
  if (spec.consent_confirmed) {
    audit('admin', 'consent_declaration', {
      campaignId: info.lastInsertRowid,
      detail: {
        domain: spec.final_url || '(без URL)',
        declared: 'CMP + Consent Mode v2 / Meta consent сигнали активни за EEA трафик',
      },
    });
  }

  if (b.add_recommended_rules === 'on') {
    const target = campaign.bidding_target || 10;
    const stmt = db.prepare(
      `INSERT INTO rules (campaign_id, name, metric, operator, threshold, lookback_days, min_spend, action, action_value, cooldown_hours)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    stmt.run(
      info.lastInsertRowid,
      'Пауза при изгорял CPA',
      'cpa',
      '>',
      target * 2,
      7,
      100,
      'pause',
      null,
      24
    );
    stmt.run(
      info.lastInsertRowid,
      'Скалирай печеливша (+20%)',
      'roas',
      '>',
      3,
      7,
      100,
      'scale_budget',
      20,
      72
    );
    stmt.run(
      info.lastInsertRowid,
      'Умора на креатива',
      'frequency',
      '>',
      3.5,
      7,
      20,
      'notify',
      null,
      48
    );
    stmt.run(
      info.lastInsertRowid,
      'Дневен спирачен праг',
      'spend_today',
      '>',
      campaign.daily_budget * 1.5,
      1,
      0,
      'pause',
      null,
      12
    );
    stmt.run(
      info.lastInsertRowid,
      'Умора: CTR спад ≥25% спрямо себе си',
      'ctr_drop_pct',
      '>=',
      25,
      7,
      50,
      'notify',
      null,
      48
    );
    stmt.run(
      info.lastInsertRowid,
      '„Кървяща“ кампания (CTR < 1%, има разход)',
      'ctr',
      '<',
      0.01,
      7,
      50,
      'pause',
      null,
      48
    );
    stmt.run(
      info.lastInsertRowid,
      'Pacing аларма (+15% над дневния бюджет)',
      'spend_today',
      '>',
      campaign.daily_budget * 1.15,
      1,
      0,
      'notify',
      null,
      12
    );
  }

  res.redirect(`/campaigns/${info.lastInsertRowid}`);
});

router.get('/campaigns/:id', (req, res) => {
  const campaign = db.prepare(`SELECT * FROM campaigns WHERE id=?`).get(req.params.id);
  if (!campaign)
    return res.status(404).render('error', { title: '404', message: 'Няма такава кампания.' });
  const metrics = db
    .prepare(`SELECT * FROM metrics_daily WHERE campaign_id=? ORDER BY date DESC LIMIT 30`)
    .all(campaign.id);
  const rules = db.prepare(`SELECT * FROM rules WHERE campaign_id=? ORDER BY id`).all(campaign.id);
  const auditRows = db
    .prepare(`SELECT * FROM audit_log WHERE campaign_id=? ORDER BY id DESC LIMIT 20`)
    .all(campaign.id);
  res.render('campaign-detail', {
    title: campaign.name,
    campaign,
    spec: JSON.parse(campaign.spec_json || '{}'),
    agg: aggregateMetrics(campaign.id, 7),
    metrics,
    rules,
    auditRows,
    series: dailySeries(campaign.id, 14),
  });
});

// Публикуване: минава през предпазителите, създава се PAUSED в платформата.
router.post('/campaigns/:id/publish', async (req, res, next) => {
  try {
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE id=?`).get(req.params.id);
    // Повторно публикуване е позволено и от 'error' — частичен неуспех (напр. Meta създала
    // кампанията, но adset-ът гръмнал) иначе заклещва кампанията без изход от UI.
    if (!campaign || !['draft', 'error'].includes(campaign.status))
      return res.redirect(`/campaigns/${req.params.id}`);
    const violations = checkCampaign(campaign);
    if (violations.length) throw new GuardError(violations);

    const conn = db.prepare(`SELECT * FROM connections WHERE id=?`).get(campaign.connection_id);
    const connector = await resolveConnector(campaign.platform, conn);
    const result = await connector.publishCampaign(campaign);
    db.prepare(
      `UPDATE campaigns SET external_id=?, status='published', last_error=NULL, updated_at=datetime('now') WHERE id=?`
    ).run(result.externalId, campaign.id);
    audit('admin', 'campaign_published_paused', {
      campaignId: campaign.id,
      detail: { externalId: result.externalId },
    });
    res.redirect(`/campaigns/${campaign.id}`);
  } catch (err) {
    if (err instanceof GuardError) {
      return res
        .status(400)
        .render('error', { title: 'Спряно от предпазителите', message: err.message });
    }
    db.prepare(`UPDATE campaigns SET status='error', last_error=? WHERE id=?`).run(
      String(err.message),
      req.params.id
    );
    next(err);
  }
});

// Активиране/пауза — единственото място, откъдето кампания тръгва да харчи.
router.post('/campaigns/:id/status', async (req, res, next) => {
  try {
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE id=?`).get(req.params.id);
    const wanted = req.body.to; // 'active' | 'paused' | 'archived'
    if (!campaign || !['active', 'paused', 'archived'].includes(wanted)) return res.redirect('/');
    if (wanted === 'active') {
      const violations = checkCampaign(campaign);
      if (violations.length) throw new GuardError(violations);
    }
    // ВСЯКА промяна на статус се отразява в платформата — включително архивиране:
    // архивирана при нас, но активна в платформата кампания би продължила да харчи.
    if (campaign.external_id) {
      const conn = db.prepare(`SELECT * FROM connections WHERE id=?`).get(campaign.connection_id);
      const connector = await resolveConnector(campaign.platform, conn);
      const platformStatus =
        wanted === 'active' ? (campaign.platform === 'google' ? 'ENABLED' : 'ACTIVE') : 'PAUSED';
      await connector.setStatus(campaign, platformStatus);
    }
    db.prepare(`UPDATE campaigns SET status=?, updated_at=datetime('now') WHERE id=?`).run(
      wanted,
      campaign.id
    );
    audit('admin', `campaign_${wanted}`, { campaignId: campaign.id });
    res.redirect(`/campaigns/${campaign.id}`);
  } catch (err) {
    if (err instanceof GuardError) {
      return res
        .status(400)
        .render('error', { title: 'Спряно от предпазителите', message: err.message });
    }
    next(err);
  }
});

// ---------- Правила ----------
router.get('/rules', (req, res) => {
  const rules = db
    .prepare(
      `SELECT rules.*, campaigns.name AS campaign_name FROM rules LEFT JOIN campaigns ON campaigns.id = rules.campaign_id ORDER BY rules.id DESC`
    )
    .all();
  const campaigns = db
    .prepare(`SELECT id, name FROM campaigns WHERE status != 'archived' ORDER BY name`)
    .all();
  res.render('rules', { title: 'Правила', rules, campaigns, recommended: RECOMMENDED_RULES });
});

const ALLOWED_RULE_METRICS = new Set([
  'cpa',
  'roas',
  'ctr',
  'ctr_drop_pct',
  'frequency',
  'spend_today',
  'conversions',
]);
// 'activate' умишлено липсва — кампания активира само човек (желязно правило).
const ALLOWED_RULE_ACTIONS = new Set(['pause', 'scale_budget', 'shrink_budget', 'notify']);

router.post('/rules', (req, res) => {
  const b = req.body;
  if (!ALLOWED_RULE_METRICS.has(b.metric) || !ALLOWED_RULE_ACTIONS.has(b.action)) {
    return res.status(400).render('error', {
      title: 'Невалидно правило',
      message:
        'Непозната метрика или действие. Авто-активиране не съществува — кампания активира само човек.',
    });
  }
  db.prepare(
    `INSERT INTO rules (campaign_id, name, metric, operator, threshold, lookback_days, min_spend, action, action_value, cooldown_hours)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    b.campaign_id || null,
    b.name?.trim() || 'Правило',
    b.metric,
    b.operator,
    Number(b.threshold),
    Number(b.lookback_days || 3),
    Number(b.min_spend || 0),
    b.action,
    b.action_value ? Number(b.action_value) : null,
    Number(b.cooldown_hours || 24)
  );
  audit('admin', 'rule_created', { detail: { name: b.name } });
  res.redirect('/rules');
});

router.post('/rules/:id/toggle', (req, res) => {
  db.prepare(`UPDATE rules SET enabled = 1 - enabled WHERE id=?`).run(req.params.id);
  res.redirect('/rules');
});

router.post('/rules/:id/delete', (req, res) => {
  db.prepare(`DELETE FROM rules WHERE id=?`).run(req.params.id);
  res.redirect('/rules');
});

// Ръчно завъртане на цикъла (синхронизация + правила) — полезно и за тестове.
router.post('/scheduler/tick', async (req, res, next) => {
  try {
    const result = await tick();
    audit('admin', 'manual_tick', { detail: result });
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

// ---------- Одитна следа ----------
router.get('/audit', (req, res) => {
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 200`).all();
  res.render('audit', { title: 'Одитна следа', rows });
});
