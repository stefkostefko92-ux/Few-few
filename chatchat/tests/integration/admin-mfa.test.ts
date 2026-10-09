import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { decryptSecret } from '../../src/crypto.js';
import {
  Client,
  db,
  makeUser,
  MFA_KEY,
  PASSWORD,
  resetDb,
  signIn,
  startApp,
  totpNow,
  type Harness,
  type Res,
} from './helpers.js';
import { baseContext, seedWorld, type World } from './world.js';

/**
 * Вторият фактор (TOTP) през HTTP: настройка, включване, вход с код, задължителност за персонала,
 * лимит на опитите, повторен код, изключване по желание за техниците. Тайната е шифрована в базата.
 */

let h: Harness;
let w: World;

before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  w = await seedWorld(h);
});

/** Клиент от отговора на /auth/login (бисквитката + CSRF токена). */
function fromLogin(base: string, res: Res): Client {
  const cookie = /=([^;]+);/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;
  return new Client(base, cookie, res.body.csrfToken as string);
}

describe('Персонал без TOTP: задължителна настройка', () => {
  test('вход → mfa.required; данните са затворени (403 mfa_setup_required) до включване', async () => {
    const login = await startApp();
    try {
      const user = await makeUser({
        tenantId: w.tenantA.id,
        role: 'SUPPORT',
        email: 'nuovo@example.test',
        mfa: false,
      });
      const res = await new Client(login.base).post('/api/v1/auth/login', {
        email: 'nuovo@example.test',
        password: PASSWORD,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.mfa, { enabled: false, passed: false, required: true });
      const c = fromLogin(login.base, res);

      for (const r of await Promise.all([
        c.get('/api/v1/cases'),
        c.get('/api/v1/products/search'),
        c.post('/api/v1/sessions', { context: baseContext }),
        c.get('/api/v1/saved-filters?scope=CASES'),
      ])) {
        assert.equal(r.status, 403);
        assert.equal(r.body.code, 'mfa_setup_required');
      }
      const me = await c.get('/api/v1/auth/me');
      assert.equal(me.status, 200);
      assert.deepEqual(me.body.mfa, { enabled: false, passed: false, required: true });

      // Настройката иска паролата (открадната сесия не си включва MFA сама).
      const wrong = await c.post('/api/v1/auth/mfa/setup', { password: 'not the password' });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.code, 'invalid_password');
      const setup = await c.post('/api/v1/auth/mfa/setup', { password: PASSWORD });
      assert.equal(setup.status, 200);
      const secret = setup.body.secret as string;
      assert.match(setup.body.otpauthUri, /^otpauth:\/\/totp\/ChatChat%3Anuovo%40example\.test\?/);
      assert.match(setup.body.qrSvg, /^<svg[\s\S]*<\/svg>\s*$/);

      // В базата: шифрована тайна, още НЕ включена.
      const pending = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(pending.totpEnabledAt, null);
      assert.ok(pending.totpSecretEnc && !pending.totpSecretEnc.includes(secret));
      assert.equal(decryptSecret(pending.totpSecretEnc, MFA_KEY), secret);
      assert.equal((await c.get('/api/v1/cases')).status, 403, 'неактивна тайна не стига');

      const bad = await c.post('/api/v1/auth/mfa/enable', { code: '000000' });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.code, 'invalid_code');
      const enabled = await c.post('/api/v1/auth/mfa/enable', { code: totpNow(secret) });
      assert.equal(enabled.status, 200);
      assert.deepEqual(enabled.body.mfa, { enabled: true, passed: true, required: true });
      assert.equal((await c.get('/api/v1/cases')).status, 200);
      assert.equal(
        await db.auditEvent.count({ where: { action: 'auth.mfa_enabled', actorId: user.id } }),
        1,
      );
      assert.equal(
        (await c.post('/api/v1/auth/mfa/setup', { password: PASSWORD })).body.code,
        'mfa_already_enabled',
      );
    } finally {
      await login.close();
    }
  });

  test('всички роли на персонала са задължени; техниците — не', async () => {
    for (const role of [
      'SUPPORT',
      'ENGINEERING',
      'KNOWLEDGE_OWNER',
      'TENANT_ADMIN',
      'PLATFORM_ADMIN',
    ] as const) {
      const u = await makeUser({ tenantId: w.tenantA.id, role, mfa: false });
      const c = await signIn(h, u);
      const r = await c.get('/api/v1/cases');
      assert.equal(r.status, 403, role);
      assert.equal(r.body.code, 'mfa_setup_required', role);
    }
    for (const c of [w.internal, w.portalAlfa]) {
      assert.equal((await c.get('/api/v1/cases')).status, 200);
    }
  });
});

describe('Вход с включен TOTP', () => {
  test('неминат втори фактор → 401 mfa_required навсякъде; verify → достъп; одит', async () => {
    const c = await signIn(h, w.users.ownerA1, { mfaPassed: false });
    for (const r of await Promise.all([
      c.get('/api/v1/cases'),
      c.get('/api/v1/admin/documents'),
      c.post('/api/v1/admin/products', { family: 'X', model: 'X-1', revisions: [] }),
      c.get('/api/v1/devices/SN-ALFA-1'),
    ])) {
      assert.equal(r.status, 401);
      assert.equal(r.body.code, 'mfa_required');
    }
    assert.deepEqual((await c.get('/api/v1/auth/me')).body.mfa, {
      enabled: true,
      passed: false,
      required: true,
    });

    const wrong = await c.post('/api/v1/auth/mfa/verify', { code: '123456' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'invalid_code');
    const ok = await c.post('/api/v1/auth/mfa/verify', { code: totpNow() });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.mfa.passed, true);
    assert.equal((await c.get('/api/v1/admin/documents')).status, 200);
    assert.equal((await c.get('/api/v1/auth/me')).body.mfa.passed, true);

    const actions = (
      await db.auditEvent.findMany({
        where: { actorId: w.users.ownerA1.id },
        select: { action: true },
      })
    ).map((e) => e.action);
    assert.ok(actions.includes('auth.mfa_failed'));
    assert.ok(actions.includes('auth.mfa_verified'));
  });

  test('същият код не минава втори път (друга сесия на същия човек)', async () => {
    const a = await signIn(h, w.users.support, { mfaPassed: false });
    const b = await signIn(h, w.users.support, { mfaPassed: false });
    const code = totpNow();
    assert.equal((await a.post('/api/v1/auth/mfa/verify', { code })).status, 200);
    const replay = await b.post('/api/v1/auth/mfa/verify', { code });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.code, 'invalid_code');
    assert.equal((await b.get('/api/v1/cases')).status, 401);
  });

  test('лимит: 5 грешни кода → 429 too_many_attempts, дори с верния', async () => {
    const c = await signIn(h, w.users.tenantAdmin, { mfaPassed: false });
    for (let i = 1; i <= 5; i += 1) {
      assert.equal((await c.post('/api/v1/auth/mfa/verify', { code: '000000' })).status, 400);
    }
    const blocked = await c.post('/api/v1/auth/mfa/verify', { code: totpNow() });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'too_many_attempts');
    assert.equal((await c.get('/api/v1/audit')).status, 401);
    // Лимитът е по човек: друг служител не е засегнат.
    const other = await signIn(h, w.users.support, { mfaPassed: false });
    assert.equal((await other.post('/api/v1/auth/mfa/verify', { code: totpNow() })).status, 200);
  });

  test('CSRF важи и за /auth/mfa/*', async () => {
    const c = await signIn(h, w.users.support, { mfaPassed: false });
    const r = await c.post('/api/v1/auth/mfa/verify', { code: totpNow() }, { csrf: null });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'csrf');
  });

  test('персоналът не може да изключи втория фактор', async () => {
    const r = await w.support.post('/api/v1/auth/mfa/disable', { code: totpNow() });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'mfa_required_for_role');
    assert.ok(
      (await db.user.findUniqueOrThrow({ where: { id: w.users.support.id } })).totpEnabledAt,
    );
  });
});

describe('Техници: по желание', () => {
  test('без TOTP стигат до данните; включен → иска се при вход; изключване с код', async () => {
    const c = w.portalAlfa;
    assert.deepEqual((await c.get('/api/v1/auth/me')).body.mfa, {
      enabled: false,
      passed: false,
      required: false,
    });
    assert.equal(
      (await c.post('/api/v1/auth/mfa/verify', { code: '123456' })).body.code,
      'mfa_not_enabled',
    );
    const setup = await c.post('/api/v1/auth/mfa/setup', { password: PASSWORD });
    const secret = setup.body.secret as string;
    assert.equal((await c.post('/api/v1/auth/mfa/enable', { code: totpNow(secret) })).status, 200);
    assert.equal((await c.get('/api/v1/cases')).status, 200, 'тази сесия е минала');

    const second = await signIn(h, w.users.portalAlfa);
    const r = await second.get('/api/v1/cases');
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'mfa_required');

    // Следващата стъпка (+30 s е в прозореца) — кодът от включването не се ползва повторно.
    const off = await c.post('/api/v1/auth/mfa/disable', { code: totpNow(secret, 1) });
    assert.equal(off.status, 200);
    assert.deepEqual(off.body.mfa, { enabled: false, passed: false, required: false });
    assert.equal((await second.get('/api/v1/cases')).status, 200);
    const row = await db.user.findUniqueOrThrow({ where: { id: w.users.portalAlfa.id } });
    assert.deepEqual([row.totpSecretEnc, row.totpEnabledAt], [null, null]);
  });
});
