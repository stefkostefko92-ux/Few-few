import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { FROM, seedKpiWorld, TO, type KpiWorld } from './kpi-world.js';

/**
 * KPI §16.1 (GET /admin/kpi): точните стойности за познатия набор от `kpi-world.ts`,
 * k-анонимността (клетки под 5 → „<5“, вторично скриване), изолацията по клиент и правата.
 */

let h: Harness;
let w: KpiWorld;
let evalDir: string;

const period = `from=${FROM}&to=${TO}`;
const HOUR = 3600;

before(async () => {
  evalDir = await mkdtemp(join(tmpdir(), 'chatchat-kpi-'));
  h = await startApp({ diagnose: 'none', evalReportsDir: evalDir });
});
after(async () => {
  await h.close();
  await db.$disconnect();
  await rm(evalDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  w = await seedKpiWorld();
});

describe('KPI: стойности за познатия набор', () => {
  test('случаи: време до решение, FCR, ескалация (клиент A, септември)', async () => {
    const res = await (await signIn(h, w.users.support)).get(`/api/v1/admin/kpi?${period}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const k = res.body;
    assert.deepEqual(k.period, { from: FROM, to: TO, model: null, bucket: 'day' });
    assert.equal(k.kAnonymity, 5);
    assert.deepEqual(k.cases, { total: 23, resolved: 10, withOutcome: 20 });
    // 1,1,2,3,4,5,6,10,20,30 ч. → медиана 4,5 ч.; p90 (линейна интерполация) 21 ч.
    assert.deepEqual(k.timeToResolution, {
      n: 10,
      medianSeconds: 4.5 * HOUR,
      p90Seconds: 21 * HOUR,
    });
    // Решени без тикет и без оператор: R1…R6 + LTX-900 = 7 от 20 с изход.
    assert.deepEqual(k.firstContactResolution, { num: 7, den: 20, value: 0.35 });
    assert.deepEqual(k.escalation.rate, { num: 10, den: 23, value: 0.4348 });
    assert.equal(k.escalation.byAiRecommendation, 5);
    assert.equal(k.escalation.byTechnicianDecision, 5);
    // Поет е само един случай → „<5“, без стойност.
    assert.deepEqual(k.escalation.takeover, { num: '<5', den: 23, value: null });
    assert.deepEqual(k.models, []);
  });

  test('AI отговори: доказателства, намеси на Gate, обратна връзка', async () => {
    const res = await (await signIn(h, w.users.owner)).get(`/api/v1/admin/kpi?${period}`);
    assert.equal(res.status, 200);
    const a = res.body.answers;
    assert.equal(a.total, 15);
    assert.deepEqual(a.evidence, { strong: 5, high: '<5', weak: '<5', conflict: '<5', none: 6 });
    assert.deepEqual(a.noEvidence, { num: 6, den: 15, value: 0.4 });
    assert.deepEqual(a.stepsRemoved, { num: 5, den: 15, value: 0.3333 });
    assert.deepEqual(a.blocked, { num: 5, den: 15, value: 0.3333 });
    assert.deepEqual(a.recommendedEscalation, { num: 6, den: 15, value: 0.4 });
    assert.deepEqual(a.removalReasons, {
      'gate.removed.directCommand': '<5',
      'gate.removed.safetyUnapproved': 0,
      'gate.removed.bypassRequest': 0,
      'gate.removed.unsupported': 5,
      'gate.removed.configNeedsContext': 0,
    });
    const f = res.body.feedback;
    assert.equal(f.total, 16);
    assert.deepEqual(f.ratings, { USEFUL: 6, NOT_USEFUL: 5, TECHNICAL_ERROR: 5 });
    assert.deepEqual(f.useful, { num: 6, den: 16, value: 0.375 });
    assert.deepEqual(f.technicalError, { num: 5, den: 16, value: 0.3125 });
    assert.deepEqual(f.coverage, { num: 14, den: 15, value: 0.9333 });
  });

  test('серия по дни: празните дни са 0, малките — „<5“, вторично скриване', async () => {
    const res = await (await signIn(h, w.users.engineering)).get(`/api/v1/admin/kpi?${period}`);
    const s = res.body.series as Array<Record<string, unknown>>;
    assert.equal(s.length, 30);
    assert.equal(s[0]?.bucket, FROM);
    assert.deepEqual(s[0], { bucket: FROM, created: 0, resolved: 0, escalated: 0 });
    // 2 септ.: 5 създадени и 5 решени — видими; скритите (2 и единици) не са еднозначни.
    assert.equal(s[1]?.created, 5);
    assert.equal(s[1]?.resolved, 5);
    assert.equal(s[2]?.created, '<5');
    // Ескалациите са само единици по дни → сборът би ги издал; нищо положително не се вижда.
    assert.ok(s.every((b) => b.escalated === 0 || b.escalated === '<5'));
  });

  test('филтър по модел; седмични кофи над 62 дни', async () => {
    const support = await signIn(h, w.users.support);
    const ltx = await support.get(`/api/v1/admin/kpi?${period}&model=LTX-500`);
    assert.deepEqual(ltx.body.cases, { total: 22, resolved: 9, withOutcome: 19 });
    assert.deepEqual(ltx.body.firstContactResolution, { num: 6, den: 19, value: 0.3158 });
    const other = await support.get(`/api/v1/admin/kpi?${period}&model=LTX-900`);
    assert.deepEqual(other.body.cases, { total: '<5', resolved: '<5', withOutcome: '<5' });
    assert.deepEqual(other.body.timeToResolution, {
      n: '<5',
      medianSeconds: null,
      p90Seconds: null,
    });
    assert.equal(other.body.answers.total, 0);
    const long = await support.get(
      '/api/v1/admin/kpi?from=2026-06-01T00:00:00Z&to=2026-10-01T00:00:00Z',
    );
    assert.equal(long.status, 200);
    assert.equal(long.body.period.bucket, 'week');
    // Включва и августовския случай (24 общо); седмиците започват в понеделник.
    assert.equal(long.body.cases.total, 24);
    assert.equal(new Date(long.body.series[0].bucket).getUTCDay(), 1);
  });
});

describe('KPI: k-анонимност и лични данни', () => {
  test('в отговора няма имена, имейли и идентификатори на хора', async () => {
    const res = await (await signIn(h, w.users.tenantAdmin)).get(`/api/v1/admin/kpi?${period}`);
    assert.equal(res.status, 200);
    const raw = JSON.stringify(res.body);
    for (const u of Object.values(w.users)) {
      assert.equal(raw.includes(u.id), false, 'id на човек');
      assert.equal(raw.includes(u.email), false, 'имейл');
      assert.equal(raw.includes(u.name), false, 'име');
    }
    assert.equal(raw.includes('CASE-KPI'), false, 'номер на случай');
  });

  test('чужд клиент вижда само своето — и то под прага', async () => {
    const res = await (await signIn(h, w.users.ownerB)).get(`/api/v1/admin/kpi?${period}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.cases, { total: '<5', resolved: 0, withOutcome: '<5' });
    assert.deepEqual(res.body.escalation.rate, { num: '<5', den: '<5', value: null });
    assert.equal(res.body.answers.total, '<5');
    assert.equal(res.body.feedback.total, 0);
  });
});

describe('KPI: права и вход', () => {
  test('kpi:read — поддръжка, инженеринг, знание, администратор на клиента; другите → 403', async () => {
    for (const u of [w.users.support, w.users.engineering, w.users.owner, w.users.tenantAdmin]) {
      const res = await (await signIn(h, u)).get(`/api/v1/admin/kpi?${period}`);
      assert.equal(res.status, 200, u.role);
    }
    for (const u of [w.users.portal, w.users.tech, w.users.platform]) {
      const res = await (await signIn(h, u)).get(`/api/v1/admin/kpi?${period}`);
      assert.equal(res.status, 403, u.role);
    }
    const me = await (await signIn(h, w.users.support)).get('/api/v1/auth/me');
    assert.ok(me.body.capabilities.includes('kpi:read'));
    const portalMe = await (await signIn(h, w.users.portal)).get('/api/v1/auth/me');
    assert.equal(portalMe.body.capabilities.includes('kpi:read'), false);
  });

  test('без сесия → 401; персонал без минат втори фактор → 401', async () => {
    const anon = await (
      await signIn(h, w.users.support)
    ).get(`/api/v1/admin/kpi?${period}`, {
      cookie: false,
    });
    assert.equal(anon.status, 401);
    const half = await signIn(h, w.users.support, { mfaPassed: false });
    assert.equal((await half.get(`/api/v1/admin/kpi?${period}`)).status, 401);
  });

  test('заявката: .strict(), период > 0 и ≤ 366 дни', async () => {
    const c = await signIn(h, w.users.support);
    const code = async (q: string) => {
      const r = await c.get(`/api/v1/admin/kpi?${q}`);
      return `${r.status}:${r.body?.error ?? ''}`;
    };
    assert.equal(await code(`${period}&tenantId=${w.tenantB.id}`), '400:invalid_input');
    assert.equal(await code('from=ieri'), '400:invalid_input');
    assert.equal(await code(`from=${TO}&to=${FROM}`), '400:invalid_period');
    assert.equal(
      await code('from=2025-01-01T00:00:00Z&to=2026-01-03T00:00:00Z'),
      '400:invalid_period',
    );
    // По подразбиране — последните 30 дни.
    const def = await c.get('/api/v1/admin/kpi');
    assert.equal(def.status, 200);
    const span = Date.parse(def.body.period.to) - Date.parse(def.body.period.from);
    assert.equal(span, 30 * 86_400_000);
  });
});

describe('KPI: метриките от оценъчния набор', () => {
  test('без отчет → null; с отчети → последният валиден, само агрегати', async () => {
    const c = await signIn(h, w.users.support);
    assert.equal((await c.get(`/api/v1/admin/kpi?${period}`)).body.evaluation, null);
    const ratio = (num: number, den: number) => ({ value: num / den, num, den });
    const report = (startedAt: string, name: string) => ({
      set: { name, version: '1', fixture: true, file: `${name}.json` },
      promptVersion: 'p+g',
      knowledgeSnapshotId: 'snap',
      diagnosisModel: 'fake-deterministic (evals/lib/fake-model.ts)',
      startedAt,
      metrics: {
        cases: 12,
        retrievalHitRate: ratio(9, 10),
        citationPrecision: ratio(8, 10),
        versionAccuracy: ratio(7, 8),
        escalationPrecision: ratio(3, 4),
        escalationRecall: ratio(3, 3),
        safetyViolationRate: ratio(0, 12),
        statusAccuracy: ratio(10, 12),
        levelAccuracy: ratio(11, 12),
      },
      cases: [{ id: 'SEGRETO-CASO', tags: ['x'] }],
    });
    await writeFile(
      join(evalDir, 'old.json'),
      JSON.stringify(report('2026-09-01T10:00:00.000Z', 'old')),
    );
    await writeFile(
      join(evalDir, 'new.json'),
      JSON.stringify(report('2026-10-01T10:00:00.000Z', 'new')),
    );
    await writeFile(join(evalDir, 'broken.json'), '{ non json');
    const res = await c.get(`/api/v1/admin/kpi?${period}`);
    const e = res.body.evaluation;
    assert.equal(e.set.name, 'new');
    assert.equal(e.fakeModel, true);
    assert.equal(e.cases, 12);
    assert.deepEqual(e.versionAccuracy, { value: 0.875, num: 7, den: 8 });
    assert.deepEqual(e.safetyViolationRate, { value: 0, num: 0, den: 12 });
    assert.equal(JSON.stringify(res.body).includes('SEGRETO-CASO'), false);
  });
});
