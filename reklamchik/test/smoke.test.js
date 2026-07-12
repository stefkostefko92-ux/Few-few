// Smoke тестове: guard-ове, правила, dry-run publish, auth и рендиране на страници.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';

const { db, audit } = await import('../src/db.js');
const { checkCampaign, checkBudgetChange } = await import('../src/guard.js');
const { encrypt, decrypt } = await import('../src/crypto.js');
const { DryRunConnector } = await import('../src/connectors/base.js');
const { aggregateMetrics, runRules } = await import('../src/rules.js');
const { createApp } = await import('../src/app.js');

let connSeq = 0;
function seedConnection() {
  return db
    .prepare(
      `INSERT INTO connections (platform, label, external_account_id) VALUES ('meta','тест',?)`
    )
    .run(`act_${++connSeq}`).lastInsertRowid;
}

function seedCampaign(connectionId, overrides = {}) {
  const c = {
    connection_id: connectionId,
    name: 'Тестова кампания',
    platform: 'meta',
    objective: 'OUTCOME_SALES',
    daily_budget: 10,
    spec_json: JSON.stringify({ consent_confirmed: true, geo: ['BG'], age_min: 18 }),
    special_ad_categories: '[]',
    ai_generated_creative: 0,
    status: 'draft',
    ...overrides,
  };
  const info = db
    .prepare(
      `INSERT INTO campaigns (connection_id, name, platform, objective, daily_budget, spec_json, special_ad_categories, ai_generated_creative, status)
       VALUES (@connection_id, @name, @platform, @objective, @daily_budget, @spec_json, @special_ad_categories, @ai_generated_creative, @status)`
    )
    .run(c);
  return { id: info.lastInsertRowid, ...c };
}

test('крипто: encrypt/decrypt кръг', () => {
  const token = 'secret-token-123';
  assert.equal(decrypt(encrypt(token)), token);
  assert.equal(encrypt(''), null);
});

test('guard: спира бюджет над тавана', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { daily_budget: 99999 });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('таван')));
});

test('guard: спира EEA кампания без потвърдено съгласие', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { spec_json: JSON.stringify({ geo: ['BG'], age_min: 18 }) });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('consent')));
});

test('guard: спира под-18 профилиране (DSA)', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, {
    spec_json: JSON.stringify({
      consent_confirmed: true,
      geo: ['BG'],
      age_min: 16,
      interests: ['games'],
    }),
  });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('DSA')));
});

test('guard: AI креатив без разкриване се спира', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { ai_generated_creative: 1 });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('AI Act')));
});

test('guard: чиста кампания минава', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId);
  assert.deepEqual(checkCampaign(c), []);
});

test('guard: авто-скалиране над +20% е забранено', () => {
  const c = { daily_budget: 10 };
  assert.ok(checkBudgetChange(c, 13).length > 0); // +30%
  assert.equal(checkBudgetChange(c, 12).length, 0); // +20%
});

test('dry-run connector: публикува PAUSED и дава детерминистични метрики', async () => {
  const connId = seedConnection();
  const c = seedCampaign(connId);
  const conn = new DryRunConnector('meta');
  const res = await conn.publishCampaign(c);
  assert.equal(res.status, 'PAUSED');
  assert.match(res.externalId, /^dry_meta_/);
  const m1 = await conn.fetchDailyMetrics({ id: c.id, daily_budget: 10 }, '2026-07-11');
  const m2 = await conn.fetchDailyMetrics({ id: c.id, daily_budget: 10 }, '2026-07-11');
  assert.deepEqual(m1, m2); // детерминистично по (кампания, дата)
  assert.ok(m1.spend <= 10);
});

test('правила: pause правило пали при надвишен CPA и спазва cooldown', async () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'active' });
  // CPA = 200/2 = 100 > праг 50; spend 200 > min_spend 100
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions) VALUES (?, date('now'), 1000, 50, 200, 2)`
  ).run(c.id);
  db.prepare(
    `INSERT INTO rules (campaign_id, name, metric, operator, threshold, lookback_days, min_spend, action, cooldown_hours)
     VALUES (?, 'CPA стоп', 'cpa', '>', 50, 7, 100, 'pause', 24)`
  ).run(c.id);

  const fired = await runRules();
  assert.equal(fired.length, 1);
  assert.equal(db.prepare(`SELECT status FROM campaigns WHERE id=?`).get(c.id).status, 'paused');

  // Второ завъртане: cooldown → нищо не пали.
  const again = await runRules();
  assert.equal(again.length, 0);
});

test('правила: недостатъчен spend → никакво действие', async () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'active', name: 'Малка' });
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions) VALUES (?, date('now'), 100, 5, 3, 0)`
  ).run(c.id);
  db.prepare(
    `INSERT INTO rules (campaign_id, name, metric, operator, threshold, lookback_days, min_spend, action, cooldown_hours)
     VALUES (?, 'CPA стоп', 'cpa', '>', 1, 7, 100, 'pause', 24)`
  ).run(c.id);
  await runRules();
  assert.equal(db.prepare(`SELECT status FROM campaigns WHERE id=?`).get(c.id).status, 'active');
});

test('aggregateMetrics смята CPA/ROAS/CTR', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId);
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions, conversion_value)
     VALUES (?, date('now'), 1000, 20, 50, 5, 200)`
  ).run(c.id);
  const agg = aggregateMetrics(c.id, 7);
  assert.equal(agg.cpa, 10);
  assert.equal(agg.roas, 4);
  assert.equal(agg.ctr, 0.02);
});

test('одит: запис', () => {
  audit('test', 'проба', { detail: { x: 1 } });
  const row = db.prepare(`SELECT * FROM audit_log WHERE actor='test'`).get();
  assert.equal(row.action, 'проба');
});

test('HTTP: / без сесия → redirect към /login; /login рендира', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(r1.status, 302);
    assert.equal(r1.headers.get('location'), '/login');
    const r2 = await fetch(`${base}/login`);
    assert.equal(r2.status, 200);
    assert.match(await r2.text(), /Вход в Рекламчика/);
  } finally {
    server.close();
  }
});
