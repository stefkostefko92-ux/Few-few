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
    assert.match(await r2.text(), /Вход в Supreme AdManager/);
  } finally {
    server.close();
  }
});

test('HTTP: архивиране на активна кампания я паузира и в платформата', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // 1) Логин с dev креденшъли (CSRF: бисквитка + скрито поле).
    const r1 = await fetch(`${base}/login`);
    const cookies = r1.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const csrf = (await r1.text()).match(/name="_csrf" value="([^"]+)"/)[1];
    const r2 = await fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, email: 'admin@localhost', password: 'admin' }),
    });
    assert.equal(r2.status, 302);
    const session = r2.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const jar = `${cookies}; ${session}`;

    // 2) Активна публикувана кампания директно в базата.
    const connId = seedConnection();
    const c = seedCampaign(connId, { status: 'active' });
    db.prepare(`UPDATE campaigns SET external_id='dry_meta_test' WHERE id=?`).run(c.id);

    // 3) Архивиране през HTTP.
    const r3 = await fetch(`${base}/campaigns/${c.id}/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, to: 'archived' }),
    });
    assert.equal(r3.status, 302);

    // 4) Локално архивирана + платформена пауза (в dry-run: одитен запис от конектора).
    assert.equal(
      db.prepare(`SELECT status FROM campaigns WHERE id=?`).get(c.id).status,
      'archived'
    );
    const paused = db
      .prepare(
        `SELECT COUNT(*) n FROM audit_log WHERE campaign_id=? AND action LIKE 'set_status(dry-run)%'`
      )
      .get(c.id).n;
    assert.ok(paused >= 1, 'архивирането трябва да прати PAUSED към платформата');
  } finally {
    server.close();
  }
});

// --- Тестове от одита (Кодаджията + Правния Разбирач + prior art) ---

test('guard: под-18 се спира БЕЗУСЛОВНО (DSA чл. 28(2)), дори без интереси', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, {
    spec_json: JSON.stringify({ consent_confirmed: true, geo: ['BG'], age_min: 17 }),
  });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('28(2)')));
});

test('guard: чувствителен интерес (чл. 9 GDPR / DSA чл. 26(3)) се спира', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, {
    spec_json: JSON.stringify({
      consent_confirmed: true,
      geo: ['BG'],
      age_min: 18,
      interests: ['фитнес', 'диабет тип 2'],
    }),
  });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('26(3)')));
});

test('guard: Custom Audiences без правно основание се спира', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, {
    spec_json: JSON.stringify({
      consent_confirmed: true,
      geo: ['BG'],
      age_min: 18,
      custom_audiences: ['aud_1'],
    }),
  });
  const v = checkCampaign(c);
  assert.ok(v.some((x) => x.includes('audience_legal_basis')));
});

test('guard: авто-скалирането спазва ОБЩИЯ бюджетен таван', () => {
  // Пълним общия таван (1500 по подразбиране) с активни кампании.
  const connId = seedConnection();
  seedCampaign(connId, { status: 'active', daily_budget: 490, name: 'Г1' });
  seedCampaign(connId, { status: 'active', daily_budget: 490, name: 'Г2' });
  seedCampaign(connId, { status: 'active', daily_budget: 490, name: 'Г3' });
  const target = seedCampaign(connId, { status: 'active', daily_budget: 25, name: 'Г4' });
  // +20% (30) е ОК като стъпка, но 3×490 + 30 = 1500 → на ръба; 490*3+30=1500 не надвишава.
  // Взимаме 26→31.2: 1470+31.2 > 1500 → блок.
  const v = checkBudgetChange({ ...target, daily_budget: 26 }, 31.2);
  assert.ok(v.some((x) => x.includes('общият дневен бюджет')));
});

test('правила: ctr_drop_pct мери спад спрямо предишния прозорец', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId);
  // Предишен прозорец (дни -14..-8): CTR 2% · Текущ (дни -7..0): CTR 1% → спад 50%.
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks) VALUES (?, date('now','-10 days'), 10000, 200)`
  ).run(c.id);
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks) VALUES (?, date('now','-2 days'), 10000, 100)`
  ).run(c.id);
  const agg = aggregateMetrics(c.id, 7);
  assert.ok(Math.abs(agg.ctr_drop_pct - 50) < 0.001);
});

test('правила: action=activate НЕ съществува — правило с него не прави нищо', async () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused', name: 'Спряна' });
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions) VALUES (?, date('now'), 1000, 50, 200, 20)`
  ).run(c.id);
  db.prepare(
    `INSERT INTO rules (campaign_id, name, metric, operator, threshold, lookback_days, min_spend, action, cooldown_hours)
     VALUES (?, 'зло правило', 'conversions', '>', 1, 7, 0, 'activate', 1)`
  ).run(c.id);
  await runRules();
  assert.equal(db.prepare(`SELECT status FROM campaigns WHERE id=?`).get(c.id).status, 'paused');
});

test('retention: стари одит/метрик записи се чистят', async () => {
  const { retentionCleanup } = await import('../src/scheduler.js');
  db.prepare(
    `INSERT INTO audit_log (at, actor, action) VALUES (datetime('now','-30 months'), 'стар', 'старо')`
  ).run();
  const connId = seedConnection();
  const c = seedCampaign(connId);
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions) VALUES (?, date('now','-30 months'), 1)`
  ).run(c.id);
  const cleaned = retentionCleanup();
  assert.ok(cleaned.audits >= 1);
  assert.ok(cleaned.metrics >= 1);
});

test('HTTP: POST без CSRF токен → 403', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'admin@localhost', password: 'admin' }),
    });
    assert.equal(r.status, 403);
  } finally {
    server.close();
  }
});

test('HTTP: подправена сесийна бисквитка не минава', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 999999 })).toString(
      'base64url'
    );
    const r = await fetch(`${base}/`, {
      redirect: 'manual',
      headers: { cookie: `sam_session=${forged}.fakefakesignature` },
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/login');
  } finally {
    server.close();
  }
});

// --- Качествен ъпгрейд: икони, retry, policy мониторинг, графики ---

test('икони: зареждат се и са inline SVG (без emoji в UI)', async () => {
  const { icon } = await import('../src/icons.js');
  for (const name of ['megaphone', 'play', 'pause', 'flask-conical', 'shield-check']) {
    assert.match(icon(name), /^<svg[^>]+class="icon /);
  }
  assert.equal(icon('няма-такава'), '');
});

test('withRetry: retry-ва retryable, отказва не-retryable', async () => {
  const { withRetry } = await import('../src/connectors/base.js');
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) {
        const e = new Error('rate limit');
        e.retryable = true;
        throw e;
      }
      return 'ok';
    },
    { retries: 3, baseDelayMs: 1 }
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);

  let calls2 = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls2++;
        throw new Error('фатална'); // без retryable
      },
      { retries: 3, baseDelayMs: 1 }
    )
  );
  assert.equal(calls2, 1);
});

test('policy мониторинг: dry-run връща OK и се записва в policy_json', async () => {
  const { syncMetrics } = await import('../src/insights.js');
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'active', name: 'Полиси тест' });
  db.prepare(`UPDATE campaigns SET external_id='dry_meta_pol' WHERE id=?`).run(c.id);
  await syncMetrics();
  const row = db.prepare(`SELECT policy_json FROM campaigns WHERE id=?`).get(c.id);
  const policy = JSON.parse(row.policy_json);
  assert.equal(policy.status, 'OK');
  assert.ok(policy.checked_at);
});

test('dailySeries: нулево-запълнена серия с точната дължина', async () => {
  const { dailySeries } = await import('../src/insights.js');
  const s = dailySeries(null, 14);
  assert.equal(s.length, 14);
  assert.ok(s.every((d) => typeof d.spend === 'number' && typeof d.conversions === 'number'));
});

test('HTTP: /privacy и /data-deletion са публични (без логин) — Meta/Google ревю', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/privacy', '/data-deletion']) {
      const r = await fetch(`${base}${path}`);
      assert.equal(r.status, 200, `${path} трябва да е 200 без сесия`);
      const html = await r.text();
      assert.match(html, /Carbon Stealth VCC/);
      assert.match(html, /info@carbonstealth\.eu/);
    }
  } finally {
    server.close();
  }
});

// --- Интелигентен слой (intel.js + optimizer.js) — от GitHub проучването ---

const { robustZ, detectAnomalies, monthlyPacing, overdeliveryDays, forecastSpend } =
  await import('../src/intel.js');
const { mulberry32, randBeta, recommendBudgets } = await import('../src/optimizer.js');
const { weeklyDigest } = await import('../src/insights.js');
const { intelligenceSweep } = await import('../src/scheduler.js');

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function insertMetric(campaignId, date, m = {}) {
  db.prepare(
    `INSERT INTO metrics_daily (campaign_id, date, impressions, clicks, spend, conversions, conversion_value)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(campaign_id, date) DO UPDATE SET impressions=excluded.impressions,
       clicks=excluded.clicks, spend=excluded.spend, conversions=excluded.conversions,
       conversion_value=excluded.conversion_value`
  ).run(
    campaignId,
    date,
    m.impressions ?? 1000,
    m.clicks ?? 20,
    m.spend ?? 10,
    m.conversions ?? 1,
    m.conversion_value ?? 30
  );
}

test('intel: robustZ — стабилен спрямо единичен минал скок, 0 при медианата', () => {
  const history = [10, 10, 10, 12, 10, 200]; // единичен минал скок не отравя базлайна
  assert.ok(robustZ(100, history) > 3.5, 'реален скок дава голямо z');
  assert.equal(robustZ(10, [10, 10, 10, 12, 10]), 0);
  assert.equal(robustZ(5, []), null);
});

test('intel: detectAnomalies лови скок срещу същия ден от седмицата', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused' });
  const target = isoDaysAgo(1);
  for (let w = 1; w <= 8; w++) insertMetric(c.id, isoDaysAgo(1 + 7 * w), { spend: 10 });
  insertMetric(c.id, target, { spend: 300 });
  const found = detectAnomalies(c.id, target);
  assert.ok(
    found.some((a) => a.metric === 'spend' && a.direction === 'скок'),
    'скок в spend трябва да е аномалия'
  );

  // Под пода за обем (median impressions < 100) → мълчание, не шум.
  const c2 = seedCampaign(connId, { status: 'paused' });
  for (let w = 1; w <= 8; w++)
    insertMetric(c2.id, isoDaysAgo(1 + 7 * w), { impressions: 10, spend: 10 });
  insertMetric(c2.id, target, { impressions: 10, spend: 300 });
  assert.deepEqual(detectAnomalies(c2.id, target), []);
});

test('intel: monthlyPacing — over/under спрямо целта към днес', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused' });
  // Изолиран месец в бъдещето — сумата по date LIKE не се влияе от другите тестове.
  insertMetric(c.id, '2030-01-05', { spend: 100 });
  const lastDay = new Date(Date.UTC(2030, 0, 31, 12));
  const under = monthlyPacing(1000, lastDay); // цел 1000, похарчени 100 → −90%
  assert.ok(under.under && !under.over);
  assert.equal(under.spent, 100);
  assert.equal(under.targetToDate, 1000);
  const over = monthlyPacing(50, lastDay); // цел 50, похарчени 100 → +100%
  assert.ok(over.over && !over.under);
  assert.equal(monthlyPacing(0), null, '0 = изключено');
});

test('intel: forecastSpend — плоска история дава ~плоска прогноза; <7 дни → null', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused' });
  for (let d = 1; d <= 28; d++) insertMetric(c.id, isoDaysAgo(d), { spend: 10 });
  const f = forecastSpend(c.id, 7);
  assert.equal(f.forecast.length, 7);
  assert.ok(Math.abs(f.total - 70) < 5, `очакваме ~70, получихме ${f.total}`);

  const c2 = seedCampaign(connId, { status: 'paused' });
  insertMetric(c2.id, isoDaysAgo(1), { spend: 10 });
  assert.equal(forecastSpend(c2.id), null);
});

test('intel: overdeliveryDays — ден със spend > 2× бюджета', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused', daily_budget: 10 });
  insertMetric(c.id, isoDaysAgo(2), { spend: 25 });
  insertMetric(c.id, isoDaysAgo(3), { spend: 15 });
  const days = overdeliveryDays(c.id, 10, 7);
  assert.equal(days.length, 1);
  assert.equal(days[0].spend, 25);
});

test('optimizer: mulberry32 е детерминистичен; randBeta ∈ (0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const rng = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const v = randBeta(2, 5, rng);
    assert.ok(v > 0 && v < 1);
  }
});

test('optimizer: recommendBudgets — печелившата нагоре, губещата надолу, клампове ±20%', () => {
  db.prepare(`UPDATE campaigns SET status='paused' WHERE status='active'`).run(); // изолация
  const connId = seedConnection();
  const good = seedCampaign(connId, { status: 'active', daily_budget: 10, name: 'Печеливша' });
  const bad = seedCampaign(connId, { status: 'active', daily_budget: 10, name: 'Губеща' });
  insertMetric(good.id, isoDaysAgo(2), {
    clicks: 1000,
    conversions: 100,
    spend: 100,
    conversion_value: 5000,
  });
  insertMetric(bad.id, isoDaysAgo(2), {
    clicks: 1000,
    conversions: 5,
    spend: 100,
    conversion_value: 100,
  });
  const rec = recommendBudgets({ rng: mulberry32(1234) });
  assert.equal(rec.rows.length, 2);
  const g = rec.rows.find((r) => r.id === good.id);
  const b = rec.rows.find((r) => r.id === bad.id);
  assert.ok(g.winProb > b.winProb, 'печелившата има по-висок шанс за победа');
  assert.ok(g.recommended >= g.current, 'печелившата не пада');
  assert.ok(b.recommended <= b.current, 'губещата не расте');
  for (const r of rec.rows) assert.ok(Math.abs(r.deltaPct) <= 20.01, 'клампът ±20% е закон');

  // Под 2 кампании с данни → само причина, нула препоръки.
  db.prepare(`UPDATE campaigns SET status='paused' WHERE id=?`).run(bad.id);
  const alone = recommendBudgets({ rng: mulberry32(1) });
  assert.equal(alone.rows.length, 0);
  assert.ok(alone.reason);
  db.prepare(`UPDATE campaigns SET status='paused' WHERE id=?`).run(good.id);
});

test('intel: intelligenceSweep пише одитен запис за аномалия и дедупликира', () => {
  const connId = seedConnection();
  const c = seedCampaign(connId, { status: 'paused' });
  const target = isoDaysAgo(1);
  for (let w = 1; w <= 8; w++) insertMetric(c.id, isoDaysAgo(1 + 7 * w), { spend: 10 });
  insertMetric(c.id, target, { spend: 300 });
  const first = intelligenceSweep();
  assert.ok(first.anomalies >= 1, 'първият суип записва аномалията');
  const countAfterFirst = db
    .prepare(`SELECT COUNT(*) n FROM audit_log WHERE action='anomaly' AND campaign_id=?`)
    .get(c.id).n;
  intelligenceSweep();
  const countAfterSecond = db
    .prepare(`SELECT COUNT(*) n FROM audit_log WHERE action='anomaly' AND campaign_id=?`)
    .get(c.id).n;
  assert.equal(countAfterSecond, countAfterFirst, 'вторият суип не дублира записа');
});

test('insights: weeklyDigest — 5-те унифицирани метрики + промени', () => {
  const d = weeklyDigest();
  assert.deepEqual(
    d.metrics.map((m) => m.key),
    ['spend', 'impressions', 'clicks', 'conversions', 'conversion_value']
  );
  assert.ok(Array.isArray(d.perCampaign));
  assert.ok(Array.isArray(d.changes));
});

test('HTTP: /optimizer и /digest рендират (със сесия)', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/login`);
    const cookies = r1.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const csrf = (await r1.text()).match(/name="_csrf" value="([^"]+)"/)[1];
    const r2 = await fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, email: 'admin@localhost', password: 'admin' }),
    });
    const session = r2.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const jar = `${cookies}; ${session}`;
    for (const path of ['/optimizer', '/digest']) {
      const r = await fetch(`${base}${path}`, { headers: { cookie: jar } });
      assert.equal(r.status, 200, `${path} трябва да е 200`);
    }
  } finally {
    server.close();
  }
});

test('HTTP: прилагане на бюджет от оптимизатора минава през checkBudgetChange', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/login`);
    const cookies = r1.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const csrf = (await r1.text()).match(/name="_csrf" value="([^"]+)"/)[1];
    const r2 = await fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, email: 'admin@localhost', password: 'admin' }),
    });
    const session = r2.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const jar = `${cookies}; ${session}`;

    const connId = seedConnection();
    const c = seedCampaign(connId, { status: 'active', daily_budget: 10 });

    // +50% на стъпка → предпазителят спира (400).
    const rBad = await fetch(`${base}/campaigns/${c.id}/budget`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, new_budget: '15' }),
    });
    assert.equal(rBad.status, 400, 'скок +50% трябва да е спрян');
    assert.equal(
      db.prepare(`SELECT daily_budget FROM campaigns WHERE id=?`).get(c.id).daily_budget,
      10
    );

    // +20% → минава и се записва в одита.
    const rOk = await fetch(`${base}/campaigns/${c.id}/budget`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, new_budget: '12' }),
    });
    assert.equal(rOk.status, 302);
    assert.equal(
      db.prepare(`SELECT daily_budget FROM campaigns WHERE id=?`).get(c.id).daily_budget,
      12
    );
    const audited = db
      .prepare(`SELECT COUNT(*) n FROM audit_log WHERE action='budget_applied' AND campaign_id=?`)
      .get(c.id).n;
    assert.equal(audited, 1);
    db.prepare(`UPDATE campaigns SET status='paused' WHERE id=?`).run(c.id);
  } finally {
    server.close();
  }
});
