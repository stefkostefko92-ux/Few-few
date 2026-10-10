import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { appendAudit, verifyAuditChain } from '../../src/audit.js';
import { hashToken } from '../../src/crypto.js';
import {
  auditPrevHash,
  tenantByEmail,
  tenantByHelpdeskInbound,
  tenantByPasswordReset,
  tenantBySession,
  tenantBySsoDomain,
} from '../../src/db/discovery.js';
import { assertRlsRole, rlsRoleProblem } from '../../src/db/guard.js';
import { currentTenantId, withTenant } from '../../src/db/tenant-context.js';
import {
  appDb,
  db,
  makeUser,
  PEPPER,
  resetDb,
  signIn,
  startApp,
  systemDb,
  type Harness,
} from './helpers.js';
import { seedEveryTable, type SeededTenant } from './rls-world.js';

/**
 * Клиентът на приложението под RLS (src/db/rls.ts) и тесните пътища преди вход (src/db/discovery.ts):
 * „забравен“ tenantId в заявка пак не вижда/не пише чуждо; интерактивните транзакции и суровият SQL
 * носят клиента; контекстът е локален за транзакцията (пулът не го наследява); одитната верига остава
 * обща и проверима; приложението отказва роля, която заобикаля RLS.
 */

describe('RLS: клиентът на приложението', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  before(async () => {
    await resetDb();
    a = await seedEveryTable('app-a');
    b = await seedEveryTable('app-b');
  });
  after(resetDb);

  test('заявка без tenantId в where: само редовете на клиента от контекста', async () => {
    const cases = await withTenant(a.tenantId, () => appDb.case.findMany());
    assert.deepEqual(
      cases.map((c) => c.id),
      [a.caseId],
    );
    const foreign = await withTenant(a.tenantId, () =>
      appDb.case.findUnique({ where: { id: b.caseId } }),
    );
    assert.equal(foreign, null);
    // Свързаните таблици (include) — също под политиката.
    const users = await withTenant(a.tenantId, () =>
      appDb.user.findMany({ include: { sessions: true, tenant: true } }),
    );
    assert.ok(users.length > 0 && users.every((u) => u.tenantId === a.tenantId));
    assert.ok(users.every((u) => u.tenant.id === a.tenantId));
  });

  test('запис върху чужд ред: не се намира; масов запис пипа само своите', async () => {
    await assert.rejects(
      withTenant(a.tenantId, () =>
        appDb.case.update({ where: { id: b.caseId }, data: { aiPaused: true } }),
      ),
      (err: unknown) => (err as { code?: string }).code === 'P2025',
    );
    const moved = await withTenant(a.tenantId, () =>
      appDb.case.updateMany({ data: { aiPaused: true } }),
    );
    assert.equal(moved.count, 1);
    const other = await db.case.findUniqueOrThrow({ where: { id: b.caseId } });
    assert.equal(other.aiPaused, false, 'случаят на B не е пипнат');
  });

  test('създаване с чужд tenantId в контекста на A — отказано от базата', async () => {
    await assert.rejects(
      withTenant(a.tenantId, () =>
        appDb.company.create({ data: { tenantId: b.tenantId, name: 'Intrusa' } }),
      ),
    );
    assert.equal(await db.company.count({ where: { name: 'Intrusa' } }), 0);
  });

  test('без контекст: нищо не се вижда и нищо не се пише', async () => {
    assert.equal(currentTenantId(), null);
    assert.equal(await appDb.case.count(), 0);
    assert.equal(await appDb.user.count(), 0);
    await assert.rejects(appDb.company.create({ data: { tenantId: a.tenantId, name: 'Senza' } }));
  });

  test('интерактивна транзакция и суров SQL носят клиента; вложеното извикване — също', async () => {
    const out = await withTenant(b.tenantId, () =>
      appDb.$transaction(async (tx) => {
        const inTx = await tx.case.findMany({ select: { id: true } });
        const [raw] = await tx.$queryRaw<
          Array<{ n: number }>
        >`SELECT count(*)::int AS n FROM "Case"`;
        // Извикване на основния клиент вътре в транзакцията (друга връзка) — пак клиентът от контекста.
        const outside = await appDb.case.findMany({ select: { id: true } });
        return { inTx, raw: raw?.n, outside };
      }),
    );
    assert.deepEqual(
      out.inTx.map((c) => c.id),
      [b.caseId],
    );
    assert.equal(out.raw, 1);
    assert.deepEqual(
      out.outside.map((c) => c.id),
      [b.caseId],
    );
    const [raw] = await withTenant(
      a.tenantId,
      () => appDb.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "DocumentChunk"`,
    );
    assert.equal(raw?.n, 1);
  });

  test('пакетна $transaction([...]) е отказана (би разкъсала транзакцията)', async () => {
    await assert.rejects(
      withTenant(a.tenantId, async () => appDb.$transaction([appDb.case.count()])),
      /callback/,
    );
  });

  test('контекстът е локален за транзакцията: пулът не го наследява', async () => {
    await Promise.all(
      Array.from({ length: 30 }, () => withTenant(a.tenantId, () => appDb.case.count())),
    );
    const after = await Promise.all(
      Array.from(
        { length: 30 },
        () =>
          appDb.$queryRaw<
            Array<{ t: string | null; n: number }>
          >`SELECT current_setting('app.tenant_id', true) AS t, (SELECT count(*)::int FROM "Case") AS n`,
      ),
    );
    for (const [row] of after) {
      assert.ok(row);
      assert.ok(row.t === null || row.t === '', `остатъчен контекст: ${row.t}`);
      assert.equal(row.n, 0);
    }
  });

  test('тесните пътища: само id на клиента, само за живо/включено', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: a.userId } });
    assert.equal(await tenantByEmail(appDb, user.email), a.tenantId);
    assert.equal(await tenantByEmail(appDb, 'nessuno@example.test'), null);

    const session = await db.session.findFirstOrThrow({ where: { userId: a.userId } });
    assert.equal(await tenantBySession(appDb, session.tokenHash), a.tenantId);
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    assert.equal(await tenantBySession(appDb, session.tokenHash), null, 'отнета сесия');

    const reset = await db.passwordReset.findFirstOrThrow({ where: { userId: a.userId } });
    assert.equal(await tenantByPasswordReset(appDb, reset.tokenHash), a.tenantId);
    await db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    assert.equal(await tenantByPasswordReset(appDb, reset.tokenHash), null, 'използван линк');

    const domain = await db.ssoDomain.findFirstOrThrow({ where: { tenantId: b.tenantId } });
    assert.equal(await tenantBySsoDomain(appDb, domain.domain), null, 'изключен доставчик');
    await db.ssoConfig.update({ where: { id: domain.configId }, data: { enabled: true } });
    assert.equal(await tenantBySsoDomain(appDb, domain.domain), b.tenantId);

    const hd = await db.helpdeskIntegration.findFirstOrThrow({ where: { tenantId: b.tenantId } });
    assert.equal(await tenantByHelpdeskInbound(appDb, hd.inboundId), b.tenantId);
    assert.equal(await tenantByHelpdeskInbound(appDb, 'x'.repeat(32)), null);

    // EXECUTE има само ролята на приложението (одитният хеш — и системната).
    const [grants] = await db.$queryRaw<Array<{ pub: boolean; sys: boolean; app: boolean }>>`
      SELECT has_function_privilege('public', 'chatchat_tenant_by_email(text)', 'EXECUTE') AS pub,
             has_function_privilege('chatchat_system', 'chatchat_tenant_by_session(text)', 'EXECUTE') AS sys,
             has_function_privilege('chatchat_app', 'chatchat_tenant_by_session(text)', 'EXECUTE') AS app`;
    assert.deepEqual(grants, { pub: false, sys: false, app: true });
  });

  test('всяка SECURITY DEFINER функция: без EXECUTE за PUBLIC (тесните пътища са изрични)', async () => {
    const rows = await db.$queryRaw<Array<{ fn: string; pub: boolean; app: boolean }>>`
      SELECT p.oid::regprocedure::text AS fn,
             has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
             has_function_privilege('chatchat_app', p.oid, 'EXECUTE') AS app
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
       ORDER BY 1`;
    assert.ok(rows.length >= 9, rows.map((r) => r.fn).join(', '));
    assert.deepEqual(
      rows.filter((r) => r.pub).map((r) => r.fn),
      [],
    );
    assert.ok(rows.every((r) => r.app));
  });

  test('кандидатите за търсенето в историята: само id-та на клиента от контекста', async () => {
    const ids = (fn: string, word: string) =>
      appDb
        .$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT ${fn}(to_tsquery('chatchat_search', $1)) AS id`,
          word,
        )
        .then((rows) => rows.map((r) => r.id));
    const own = async (t: string) => ({
      conv: await withTenant(t, () => ids('chatchat_search_conversation_messages', 'ciao')),
      kase: await withTenant(t, () => ids('chatchat_search_case_messages', 'risposta')),
    });
    const [ra, rb] = [await own(a.tenantId), await own(b.tenantId)];
    const ofA = await db.conversationMessage.findFirstOrThrow({
      where: { conversation: { tenantId: a.tenantId } },
    });
    const caseOfB = await db.caseMessage.findFirstOrThrow({ where: { caseId: b.caseId } });
    assert.deepEqual(ra.conv, [ofA.id]);
    assert.deepEqual(rb.kase, [caseOfB.id]);
    assert.ok(!rb.conv.includes(ofA.id) && !ra.kase.includes(caseOfB.id), 'нищо от другия клиент');
    // Без контекст — нищо (функцията не приема клиент като параметър).
    assert.deepEqual(await ids('chatchat_search_conversation_messages', 'ciao'), []);
  });

  test('одитната верига остава обща и проверима при записи от различни клиенти', async () => {
    await db.auditEvent.deleteMany();
    for (const t of [a.tenantId, b.tenantId, a.tenantId, b.tenantId]) {
      await withTenant(t, () =>
        appendAudit(appDb, { tenantId: t, actorId: null, action: 'rls.chain' }),
      );
    }
    assert.equal(await verifyAuditChain(db), null);
    const last = await db.auditEvent.findFirstOrThrow({ orderBy: { id: 'desc' } });
    // Под A се вижда само своето, но предишният хеш е последният ОБЩ.
    assert.equal(await withTenant(a.tenantId, () => auditPrevHash(appDb)), last.hash);
    assert.equal(await withTenant(a.tenantId, () => appDb.auditEvent.count()), 2);
    // Одит с чужд клиент от контекста на A — отказан.
    await assert.rejects(
      withTenant(a.tenantId, () =>
        appendAudit(appDb, { tenantId: b.tenantId, actorId: null, action: 'rls.forged' }),
      ),
    );
    // Приложението не пипа веригата.
    await assert.rejects(
      withTenant(a.tenantId, () => appDb.auditEvent.deleteMany()),
      (err: unknown) => /permission denied|42501/.test(String(err)),
    );
  });

  test('проверката на ролята: приложението не заобикаля RLS; собственикът и системната — да', async () => {
    assert.equal(await rlsRoleProblem(appDb), null);
    assert.equal(await rlsRoleProblem(db), 'table_owner');
    assert.equal(await rlsRoleProblem(systemDb), 'bypassrls');
    await assert.rejects(
      assertRlsRole(db, { strict: true, warn: () => undefined }),
      /заобикаля изолацията/,
    );
    const warned: string[] = [];
    await assertRlsRole(db, { strict: false, warn: (_o, m) => warned.push(m) });
    assert.equal(warned.length, 1);
  });
});

describe('RLS: сесията и заявката носят клиента', () => {
  let h: Harness;
  let a: SeededTenant;
  let b: SeededTenant;

  before(async () => {
    await resetDb();
    a = await seedEveryTable('http-a');
    b = await seedEveryTable('http-b');
    h = await startApp({ diagnose: 'none' });
  });
  after(async () => {
    await h.close();
    await resetDb();
  });

  test('вписан в A: чужд случай = 404; отнета сесия — 401 (контекстът идва само от сесията)', async () => {
    const user = await makeUser({ tenantId: a.tenantId, role: 'SUPPORT' });
    const client = await signIn(h, user);
    const token = client.cookie ?? '';
    assert.equal(await tenantBySession(appDb, hashToken(token, PEPPER)), a.tenantId);
    // В базата е само HMAC-ът — суровият токен не отваря нищо.
    assert.equal(await tenantBySession(appDb, token), null);
    assert.equal((await client.get(`/api/v1/cases/${a.caseId}`)).status, 200);
    assert.equal((await client.get(`/api/v1/cases/${b.caseId}`)).status, 404);
    await db.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    assert.equal((await client.get(`/api/v1/cases/${a.caseId}`)).status, 401);
  });
});
