/**
 * Одит-веригата v2 срещу жива PostgreSQL: стари v1 записи + нови v2 под advisory lock, котвата извън
 * базата, заличен IP, подмяна пресметната наново без ключ, изрязан край и планираната проверка.
 *
 * Тестът НАРОЧНО подправя веригата — затова работи в собствена схема (`?schema=…`), не в общата:
 * интеграционните файлове тичат паралелно срещу една база и admin-agent-flow проверява, че веригата е цяла.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hasDatabase = Boolean(process.env.DATABASE_URL);

const schema = `audit_chain_${process.pid}`;
const dbUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5432/piuma_test',
);
dbUrl.searchParams.set('schema', schema);
const anchorDir = mkdtempSync(join(tmpdir(), 'piuma-audit-anchor-'));

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_BASE_URL ??= 'https://piuma.example.com';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.IG_APP_ID ??= '123456';
process.env.IG_APP_SECRET ??= 'app-secret';
process.env.IG_REDIRECT_URI ??= 'https://piuma.example.com/auth/instagram/callback';
process.env.TOKEN_ENC_KEY ??= 'a'.repeat(64);
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL = dbUrl.toString();
process.env.AUDIT_ANCHOR_DIR = anchorDir;

const { prisma } = await import('../../src/db.js');
const { audit, runAuditCheck, verifyAuditChain } = await import('../../src/audit.js');
const { readAnchor, ANCHOR_FILE } = await import('../../src/audit-anchor.js');
const { rowHash, deriveChainKeys } = await import('../../src/audit-chain.js');

const root = fileURLToPath(new URL('../..', import.meta.url));
const keys = deriveChainKeys(process.env.TOKEN_ENC_KEY);

test('одит-веригата v2 по целия път през базата', { skip: !hasDatabase }, async (t) => {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: dbUrl.toString() },
    stdio: 'ignore',
  });
  t.after(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
    rmSync(anchorDir, { recursive: true, force: true });
  });

  // два записа отпреди преминаването — v1, суровият IP е в хеша (както ги е писал старият код)
  let prevHash = '';
  for (const n of [1, 2]) {
    const fields = {
      at: new Date(Date.UTC(2026, 9, n)),
      actorType: 'HUMAN',
      actorId: `u${n}`,
      actorLabel: `Стар ${n}`,
      action: 'legacy.action',
      targetType: null,
      targetId: null,
      detail: { n },
      ip: `192.0.2.${n}`,
      ipTag: null,
    };
    const hash = rowHash(prevHash, fields, 1, keys);
    await prisma.auditLog.create({ data: { ...fields, prevHash, hash, v: 1 } });
    prevHash = hash;
  }

  for (const n of [3, 4, 5]) {
    await audit(
      { type: 'HUMAN', id: `u${n}`, label: `Нов ${n}`, ip: `203.0.113.${n}` },
      { action: 'post.approve', targetType: 'Post', targetId: `p${n}`, detail: { n } },
    );
  }
  const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  const v2 = rows.filter((r) => r.v === 2);
  assert.equal(v2.length, 3);
  for (const row of v2) {
    assert.match(String(row.ipTag), /^[0-9a-f]{64}$/);
    assert.notEqual(row.ipTag, row.ip);
  }
  const last = rows.at(-1)!;
  const anchorFile = join(anchorDir, ANCHOR_FILE);
  // първият v2 запис заковава последния v1 номер в котвата — извън базата
  const v1MaxId = rows.filter((r) => r.v === 1).at(-1)!.id;
  assert.deepEqual(readAnchor(anchorFile), { id: last.id, hash: last.hash, v1MaxId });
  assert.deepEqual(await verifyAuditChain(), {
    ok: true,
    brokenAt: null,
    breaks: [],
    count: 5,
    head: { id: last.id, hash: last.hash },
  });

  // заличаване на суровия IP по срок (ОРЗД) — само на v2 записите — не чупи веригата
  await prisma.auditLog.updateMany({ where: { v: 2 }, data: { ip: null } });
  assert.equal((await verifyAuditChain()).ok, true, 'заличен IP');

  /** Нападател с право на запис в базата: сменя действието на `fromId` и пресмята опашката с SHA-256. */
  async function downgradeFrom(fromId: number): Promise<() => Promise<void>> {
    const saved = rows.filter((r) => r.id >= fromId);
    let chainHash = rows.find((r) => r.id === fromId - 1)!.hash;
    for (const row of saved) {
      const action = row.id === fromId ? 'post.reject' : row.action;
      const hash = rowHash(chainHash, { ...row, ip: null, action }, 1, keys);
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { action, prevHash: chainHash, hash, v: 1 },
      });
      chainHash = hash;
    }
    return async () => {
      for (const row of saved) {
        await prisma.auditLog.update({
          where: { id: row.id },
          data: { action: row.action, prevHash: row.prevHash, hash: row.hash, v: row.v },
        });
      }
    };
  }
  // след поне един v2 запис: v1 след v2 — веригата сама издава подмяната
  let restore = await downgradeFrom(v2[1]!.id);
  assert.equal((await verifyAuditChain()).brokenAt, v2[1]!.id, 'частично сваляне до v1');
  await restore();
  // цялата v2 опашка свалена до v1: v1 над закования номер — скъсано на първия подменен запис
  restore = await downgradeFrom(v2[0]!.id);
  const downgraded = await verifyAuditChain();
  assert.equal(downgraded.brokenAt, v2[0]!.id, 'пълно сваляне — закованият v1 номер');
  assert.ok(downgraded.breaks.includes(last.id), 'котвата също го вижда');
  await restore();
  assert.equal((await verifyAuditChain()).ok, true, 'възстановено');

  // две отделни подмени без преизчисляване — отчитат се и двете, не само първата
  await prisma.auditLog.update({ where: { id: v2[0]!.id }, data: { action: 'post.reject' } });
  await prisma.auditLog.update({ where: { id: v2[2]!.id }, data: { action: 'post.reject' } });
  assert.deepEqual((await verifyAuditChain()).breaks, [v2[0]!.id, v2[2]!.id]);
  for (const row of [v2[0]!, v2[2]!]) {
    await prisma.auditLog.update({ where: { id: row.id }, data: { action: row.action } });
  }
  assert.equal((await verifyAuditChain()).ok, true, 'възстановено');

  // изрязан край: последният запис изтрит — веригата в базата е цяла, котвата не е
  await prisma.auditLog.delete({ where: { id: last.id } });
  assert.equal((await verifyAuditChain()).brokenAt, last.id, 'котвата издава изрязания край');

  // Регресия (ревю, 2026-11-15): първият запис след изрязването местеше котвата напред по номер —
  // „поправяше“ я и следата изчезваше. Сега котвата стои, а записът сам вдига аларма.
  await audit(
    { type: 'HUMAN', id: 'u6', label: 'Нов 6', ip: '203.0.113.6' },
    { action: 'post.approve', targetType: 'Post', targetId: 'p6' },
  );
  const afterWrite = await verifyAuditChain();
  assert.equal(afterWrite.ok, false, 'изрязване → нов запис → пак скъсано');
  assert.equal(afterWrite.brokenAt, last.id);
  assert.deepEqual(readAnchor(anchorFile), { id: last.id, hash: last.hash, v1MaxId });

  // записът и планираната проверка вдигат аларма в одита — веднъж на място на скъсване
  await runAuditCheck();
  await runAuditCheck();
  const alarms = await prisma.auditLog.findMany({ where: { action: 'audit.chain.broken' } });
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0]!.targetId, String(last.id));
});
