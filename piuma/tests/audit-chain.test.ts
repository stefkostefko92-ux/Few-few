import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { anchorBreak, readAnchor, saveAnchor } from '../src/audit-anchor.js';
import {
  AUDIT_VERSION,
  CHAIN_START,
  canonicalJson,
  deriveChainKeys,
  ipTag,
  rowHash,
  verifyRows,
  type ChainRow,
} from '../src/audit-chain.js';

/*
 * Регресия (Стражата, 2026-11-15): веригата беше SHA-256 без ключ и без котва — който пише в
 * базата, пресмята веригата наново след подмяна и проверката казва „цяла“; изрязан край не се
 * вижда изобщо; суровият IP влизаше в хеша и не можеше да се заличи по срок, без да скъса веригата.
 */

const SECRET = 'ab'.repeat(32);
const keys = deriveChainKeys(SECRET);
const at = (n: number) => new Date(Date.UTC(2026, 10, 15, 10, 0, n));

type Fields = Omit<ChainRow, 'id' | 'prevHash' | 'hash' | 'v' | 'ipTag'>;

function fields(n: number, ip: string | null = `203.0.113.${n}`): Fields {
  return {
    at: at(n),
    actorType: 'HUMAN',
    actorId: `u${n}`,
    actorLabel: `Потребител ${n}`,
    action: 'post.approve',
    targetType: 'Post',
    targetId: `p${n}`,
    detail: { n, note: 'a|b' },
    ip,
  };
}

/** Старата формула от piuma/src/audit.ts (v1) — дословно, за да се докаже, че старите записи минават. */
function legacyV1(prevHash: string, f: Fields): string {
  const parts = [
    prevHash,
    f.at.toISOString(),
    f.actorType,
    f.actorId,
    f.action,
    f.targetType,
    f.targetId,
    f.detail === null ? null : canonicalJson(f.detail),
    f.ip,
  ];
  return createHash('sha256')
    .update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|'))
    .digest('hex');
}

/** Верига: първите `v1Count` записа по старата формула, останалите v2. */
function buildChain(total: number, v1Count = 0): ChainRow[] {
  const rows: ChainRow[] = [];
  let prevHash = '';
  for (let n = 1; n <= total; n += 1) {
    const f = fields(n);
    const v = n <= v1Count ? 1 : AUDIT_VERSION;
    const tag = v === 1 ? null : ipTag(f.ip, keys);
    const hash = v === 1 ? legacyV1(prevHash, f) : rowHash(prevHash, { ...f, ipTag: tag }, v, keys);
    rows.push({ id: n, ...f, ipTag: tag, prevHash, hash, v });
    prevHash = hash;
  }
  return rows;
}

test('v2 веригата е цяла; v1 записите отпреди преминаването се приемат', () => {
  const pure = verifyRows(CHAIN_START, buildChain(5), keys);
  assert.deepEqual(pure.breaks, []);
  assert.equal(pure.cursor.count, 5);
  const mixed = verifyRows(CHAIN_START, buildChain(6, 3), keys);
  assert.deepEqual(mixed.breaks, []);
  assert.equal(mixed.cursor.lastId, 6);
});

test('подмяна, пресметната наново със SHA-256 без ключ (старият начин), е скъсана', () => {
  const rows = buildChain(5, 2);
  // нападателят пише в базата: сменя действието на запис 4 и пресмята веригата от там нататък
  let prevHash = rows[2]!.hash;
  for (const row of rows.slice(3)) {
    if (row.id === 4) row.action = 'post.reject';
    row.v = 1;
    row.prevHash = prevHash;
    row.hash = legacyV1(prevHash, row);
    prevHash = row.hash;
  }
  assert.deepEqual(
    verifyRows(CHAIN_START, rows, keys).breaks,
    [4],
    'v1 след v2 = връщане без ключ',
  );
});

test('цялата v2 опашка, свалена до v1: без закован v1 номер я издава само котвата', () => {
  // Присъщо ограничение: без нещо извън базата преходът v1→v2 не може да се закове. Затова котвата.
  const rows = buildChain(5, 2);
  const head = { id: 5, hash: rows[4]!.hash };
  let prevHash = rows[1]!.hash;
  for (const row of rows.slice(2)) {
    if (row.id === 3) row.action = 'post.reject';
    row.v = 1;
    row.prevHash = prevHash;
    row.hash = legacyV1(prevHash, row);
    prevHash = row.hash;
  }
  const step = verifyRows(CHAIN_START, rows, keys);
  assert.deepEqual(step.breaks, []);
  assert.equal(anchorBreak(head, { lastId: 5, headHash: rows[4]!.hash }), 5);
  // Регресия (ревю, 2026-11-15): с последния v1 номер, закован извън базата, v1 над него е скъсване
  // още на първия подменен запис — без да чака котвата (и без котва изобщо).
  assert.deepEqual(verifyRows(CHAIN_START, rows, keys, 2).breaks, [3]);
  assert.deepEqual(verifyRows(CHAIN_START, buildChain(5, 2), keys, 2).breaks, [], 'законните v1');
});

/* Регресия (ревю, 2026-11-15): проверката спираше на първото скъсване — втора подмяна по-нататък
   оставаше невидима, докато първата не се изясни. */
test('всички места на скъсване се отчитат, по едно на отсечка', () => {
  const rows = buildChain(8);
  rows[2]!.action = 'post.reject'; // запис 3 — без преизчисляване
  rows[5]!.detail = { n: 6, note: 'подменено' }; // запис 6 — отделна подмяна
  assert.deepEqual(verifyRows(CHAIN_START, rows, keys).breaks, [3, 6]);
  // изтрит запис в средата: скъсването е на следващия, веригата после продължава
  const gap = buildChain(6).filter((r) => r.id !== 3);
  assert.deepEqual(verifyRows(CHAIN_START, gap, keys).breaks, [4]);
  // цяла отсечка, свалена до v1 — едно място, не по едно на запис
  const tail = buildChain(6);
  let prevHash = tail[2]!.hash;
  for (const row of tail.slice(3)) {
    row.v = 1;
    row.prevHash = prevHash;
    row.hash = legacyV1(prevHash, row);
    prevHash = row.hash;
  }
  assert.deepEqual(verifyRows(CHAIN_START, tail, keys).breaks, [4]);
  // разделено на партиди: отсечката продължава през границата, а курсорът брои всичко
  const first = verifyRows(CHAIN_START, tail.slice(0, 4), keys);
  const second = verifyRows(first.cursor, tail.slice(4), keys);
  assert.deepEqual([...first.breaks, ...second.breaks], [4]);
  assert.equal(second.cursor.count, 6);
});

test('подмяна, пресметната наново с чужд ключ, е скъсана', () => {
  const rows = buildChain(4);
  const wrong = deriveChainKeys('cd'.repeat(32));
  rows[1]!.detail = { n: 2, note: 'подменено' };
  let prevHash = rows[0]!.hash;
  for (const row of rows.slice(1)) {
    row.prevHash = prevHash;
    row.hash = rowHash(prevHash, row, AUDIT_VERSION, wrong);
    prevHash = row.hash;
  }
  assert.deepEqual(verifyRows(CHAIN_START, rows, keys).breaks, [2]);
});

test('суровият IP не е във v2 хеша: заличен по срок не чупи веригата, подменен — чупи', () => {
  const erased = buildChain(3);
  erased[1]!.ip = null;
  assert.deepEqual(verifyRows(CHAIN_START, erased, keys).breaks, [], 'заличен IP');
  const swapped = buildChain(3);
  swapped[1]!.ip = '198.51.100.7';
  assert.deepEqual(verifyRows(CHAIN_START, swapped, keys).breaks, [2], 'подменен IP без етикета');
  const tag = ipTag('203.0.113.9', keys);
  assert.match(String(tag), /^[0-9a-f]{64}$/);
  assert.ok(!String(tag).includes('203.0.113.9'));
  assert.equal(ipTag(null, keys), null);
});

test('ключовете са изведени с разделяне на домейна, не са самата тайна', () => {
  assert.notEqual(keys.chain.toString('hex'), SECRET);
  assert.notEqual(keys.chain.toString('hex'), keys.ip.toString('hex'));
  assert.equal(deriveChainKeys(SECRET).chain.toString('hex'), keys.chain.toString('hex'));
});

test('котвата издава изрязан край и пренаписан запис', () => {
  const rows = buildChain(5);
  const head = { id: 5, hash: rows[4]!.hash };
  // изрязан край: последните два записа изтрити — останалата верига сама по себе си е цяла
  const cut = verifyRows(CHAIN_START, rows.slice(0, 3), keys);
  assert.deepEqual(cut.breaks, []);
  assert.equal(anchorBreak(head, { lastId: cut.cursor.lastId, headHash: null }), 5);
  // записът на котвата е с друг хеш
  assert.equal(anchorBreak(head, { lastId: 5, headHash: 'f'.repeat(64) }), 5);
  // съвпада — наред; без котва — няма с какво да се сравни
  assert.equal(anchorBreak(head, { lastId: 7, headHash: head.hash }), null);
  assert.equal(anchorBreak(null, { lastId: 0, headHash: null }), null);
});

test('котвата се пише атомно с права 600, само напред; повреден файл = няма котва', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'piuma-anchor-'));
  try {
    const file = join(dir, 'audit-head.json');
    await saveAnchor(file, { id: 3, hash: 'a'.repeat(64) });
    await saveAnchor(file, { id: 2, hash: 'b'.repeat(64) });
    assert.deepEqual(readAnchor(file), { id: 3, hash: 'a'.repeat(64) });
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.ok(readFileSync(file, 'utf8').includes('"id":3'));
    // последният v1 номер се записва веднъж и не се сменя от следващите записи
    await saveAnchor(file, { id: 4, hash: 'c'.repeat(64), v1MaxId: 2 });
    await saveAnchor(file, { id: 5, hash: 'd'.repeat(64), v1MaxId: 9 });
    await saveAnchor(file, { id: 6, hash: 'e'.repeat(64) });
    assert.deepEqual(readAnchor(file), { id: 6, hash: 'e'.repeat(64), v1MaxId: 2 });
    writeFileSync(file, 'не е json');
    assert.equal(readAnchor(file), null);
    assert.equal(readAnchor(join(dir, 'няма.json')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
