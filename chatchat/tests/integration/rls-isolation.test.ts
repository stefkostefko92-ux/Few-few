import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { withTenant } from '../../src/db/tenant-context.js';
import { appDb, db, resetDb, systemDb } from './helpers.js';
import { seedEveryTable, seedGlobal, type SeededTenant } from './rls-world.js';

/**
 * Изолацията на клиентите в БАЗАТА (NFR-03, §15.1): генеративно по каталога на PostgreSQL — всяка
 * таблица в схемата е под RLS; с данни на клиент — с политика. Два клиента с ред във ВСЯКА таблица;
 * ролята на приложението (`chatchat_app`) без контекст не вижда нищо, с контекст — само своето, не
 * пипа и не пише чуждо; системната роля вижда всичко. Нова таблица без политика (или без ред в
 * `rls-world.ts`) = червен тест.
 */

/** Глобални таблици: RLS е включен, но политика няма (= нищо за приложението, само системната роля). */
const GLOBAL_NO_POLICY = new Set(['AuditCheckpoint']);

interface CatalogRow {
  name: string;
  rls: boolean;
  policies: number;
  hasTenantId: boolean;
}

async function catalog(): Promise<CatalogRow[]> {
  return db.$queryRaw<CatalogRow[]>`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                    AND a.attname = 'tenantId' AND NOT a.attisdropped) AS "hasTenantId"
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'
     ORDER BY c.relname`;
}

const ident = (name: string): string => {
  assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return `"${name}"`;
};

/** Кодът на грешката на PostgreSQL от суров SQL през Prisma (P2010 → meta.code). */
function sqlState(err: unknown): string | null {
  const meta = (err as { meta?: { code?: unknown } }).meta;
  if (typeof meta?.code === 'string') return meta.code;
  const m = /Code: `(\w+)`/.exec(err instanceof Error ? err.message : '');
  return m?.[1] ?? null;
}

const inContext = <T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> =>
  tenantId === null ? fn() : withTenant(tenantId, fn);

async function ctids(tenantId: string | null, table: string): Promise<string[]> {
  const rows = await inContext(tenantId, () =>
    appDb.$queryRawUnsafe<Array<{ t: string }>>(`SELECT ctid::text AS t FROM ${ident(table)}`),
  );
  return rows.map((r) => r.t).sort();
}

async function ownerCtids(table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ t: string }>>(
    `SELECT ctid::text AS t FROM ${ident(table)}`,
  );
  return rows.map((r) => r.t).sort();
}

/** Колоните, в които може да се пише (без генерираните — tsv). */
async function writableColumns(table: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    SELECT attname AS name FROM pg_attribute
     WHERE attrelid = ${ident(table)}::regclass AND attnum > 0 AND NOT attisdropped
       AND attgenerated = ''
     ORDER BY attnum`;
  return rows.map((r) => r.name);
}

describe('RLS: изолация по таблица (генеративно по каталога)', () => {
  let a: SeededTenant;
  let b: SeededTenant;
  let tables: CatalogRow[];
  let tenantTables: string[];

  before(async () => {
    await resetDb();
    a = await seedEveryTable('rls-a');
    b = await seedEveryTable('rls-b');
    await seedGlobal();
    tables = await catalog();
    tenantTables = tables.filter((t) => !GLOBAL_NO_POLICY.has(t.name)).map((t) => t.name);
  });
  after(resetDb);

  test('каталогът: всяка таблица е под RLS; с данни на клиент — с политика', () => {
    assert.ok(tables.length >= 50, `таблиците: ${tables.length}`);
    const withoutRls = tables.filter((t) => !t.rls).map((t) => t.name);
    assert.deepEqual(withoutRls, [], 'таблици без RLS');
    const withoutPolicy = tables
      .filter((t) => t.policies === 0 && !GLOBAL_NO_POLICY.has(t.name))
      .map((t) => t.name);
    assert.deepEqual(withoutPolicy, [], 'таблици с данни на клиент без политика');
    for (const name of GLOBAL_NO_POLICY) {
      const row = tables.find((t) => t.name === name);
      assert.ok(row?.rls && row.policies === 0, `${name}: RLS без политика (само системната роля)`);
    }
  });

  test('засяването покрива всяка таблица: и двата клиента имат редове', async () => {
    const missing: string[] = [];
    for (const t of tenantTables) {
      const [ra, rb] = [await ctids(a.tenantId, t), await ctids(b.tenantId, t)];
      if (ra.length === 0 || rb.length === 0) missing.push(`${t} (A ${ra.length}, B ${rb.length})`);
    }
    assert.deepEqual(missing, [], 'tests/integration/rls-world.ts трябва да засява тези таблици');
  });

  test('без контекст: нула редове във всяка таблица (fail-closed)', async () => {
    const leaking: string[] = [];
    for (const t of tenantTables) {
      const rows = await ctids(null, t);
      if (rows.length > 0) leaking.push(`${t}: ${rows.length}`);
    }
    assert.deepEqual(leaking, []);
    // Глобалните — приложението няма право изобщо (и с контекст).
    for (const t of GLOBAL_NO_POLICY) {
      for (const ctx of [null, a.tenantId]) {
        await assert.rejects(ctids(ctx, t), (err: unknown) => sqlState(err) === '42501');
      }
    }
  });

  test('клиентът вижда само своите редове: A ∩ B = ∅, A ∪ B = всичко', async () => {
    const problems: string[] = [];
    for (const t of tenantTables) {
      const ra = await ctids(a.tenantId, t);
      const rb = await ctids(b.tenantId, t);
      const all = await ownerCtids(t);
      const shared = ra.filter((x) => rb.includes(x));
      if (shared.length > 0) problems.push(`${t}: общи ${shared.length}`);
      if (ra.length + rb.length !== all.length) {
        problems.push(`${t}: A ${ra.length} + B ${rb.length} ≠ ${all.length}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test('чужд контекст не променя и не трие чужди редове', async () => {
    const problems: string[] = [];
    for (const t of tenantTables) {
      const victims = await ctids(a.tenantId, t);
      const [col] = await writableColumns(t);
      assert.ok(col);
      for (const [verb, sql] of [
        [
          'UPDATE',
          `UPDATE ${ident(t)} SET ${ident(col)} = ${ident(col)} WHERE ctid = ANY($1::tid[])`,
        ],
        ['DELETE', `DELETE FROM ${ident(t)} WHERE ctid = ANY($1::tid[])`],
      ] as const) {
        for (const ctx of [b.tenantId, null]) {
          try {
            const n = await inContext(ctx, () => appDb.$executeRawUnsafe(sql, victims));
            if (n !== 0) problems.push(`${t}: ${verb} в ${ctx ?? 'без контекст'} → ${n}`);
          } catch (err) {
            // Без право изобщо (Tenant, AuditEvent) — също отказ.
            if (sqlState(err) !== '42501') problems.push(`${t}: ${verb} → ${sqlState(err)}`);
          }
        }
      }
      const still = await ctids(a.tenantId, t);
      if (still.length !== victims.length) problems.push(`${t}: редовете на A се промениха`);
    }
    assert.deepEqual(problems, []);
  });

  test('запис на чужд ред (копие на ред на A) — отказан в контекста на B и без контекст', async () => {
    const problems: string[] = [];
    for (const t of tenantTables) {
      const cols = await writableColumns(t);
      const list = cols.map(ident).join(', ');
      const [row] = await db.$queryRawUnsafe<Array<{ j: unknown }>>(
        `SELECT row_to_json(x) AS j FROM ${ident(t)} x WHERE ctid = $1::tid`,
        (await ctids(a.tenantId, t))[0],
      );
      assert.ok(row);
      const insert = `INSERT INTO ${ident(t)} (${list})
        SELECT ${list} FROM json_populate_record(NULL::${ident(t)}, $1::json)`;
      for (const ctx of [b.tenantId, null]) {
        try {
          await inContext(ctx, () => appDb.$executeRawUnsafe(insert, JSON.stringify(row.j)));
          problems.push(`${t}: копието е записано (${ctx ?? 'без контекст'})`);
        } catch (err) {
          if (sqlState(err) !== '42501') problems.push(`${t}: ${sqlState(err)} вместо 42501`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  test('собствен ред не се „пренася“ към друг клиент (WITH CHECK)', async () => {
    const problems: string[] = [];
    for (const t of tables.filter((x) => x.hasTenantId).map((x) => x.name)) {
      const [victim] = await ctids(a.tenantId, t);
      const sql = `UPDATE ${ident(t)} SET "tenantId" = $1 WHERE ctid = $2::tid`;
      try {
        await withTenant(a.tenantId, () => appDb.$executeRawUnsafe(sql, b.tenantId, victim));
        problems.push(`${t}: редът мина към B`);
      } catch (err) {
        if (sqlState(err) !== '42501') problems.push(`${t}: ${sqlState(err)} вместо 42501`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test('системната роля (BYPASSRLS) вижда всичко — и глобалните таблици', async () => {
    const problems: string[] = [];
    for (const t of tables.map((x) => x.name)) {
      const [s] = await systemDb.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM ${ident(t)}`,
      );
      const all = await ownerCtids(t);
      if (s?.n !== all.length) problems.push(`${t}: ${s?.n} ≠ ${all.length}`);
    }
    assert.deepEqual(problems, []);
  });
});
