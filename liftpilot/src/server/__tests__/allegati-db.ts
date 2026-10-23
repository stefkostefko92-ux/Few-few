// The uploaded files' tests (allegati-upload, allegati-files) over an in-memory database: installations of two companies
// (one archived), Attachment rows with their bytes, the issued reports that use a file, and the company's advisory lock
// emulated as PostgreSQL holds it — taken by the statement, kept until the transaction ends — so that two uploads at the
// edge of a limit really run side by side. The session, the activity log and the log are mocked; the PDF tool is real.
import { mock } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

export const BASE = 'https://liftpilot.example';
process.env.PUBLIC_BASE_URL = BASE;
process.env.DATABASE_URL ??= 'postgresql://allegati-test/none';
process.env.AUTH_SECRET ??= 'allegati-test-secret-that-is-long-enough';

export interface FileRow {
  id: string; companyId: string; projectId: string; kind: string; title: string; component: string | null; fileName: string; mime: string;
  size: number; sha256: string; pages: number; width: number | null; height: number | null; orientation: number | null;
  createdById: string | null; createdAt: Date; data: Uint8Array;
}
export const state = {
  projects: [
    { id: 'p1', companyId: 'c1', archivedAt: null as Date | null },
    { id: 'p2', companyId: 'c1', archivedAt: null as Date | null },
    { id: 'parch', companyId: 'c1', archivedAt: new Date('2026-09-01') as Date | null },
    { id: 'pother', companyId: 'c2', archivedAt: null as Date | null },
  ],
  files: [] as FileRow[],
  /** attachment ids an issued relazione tecnica lists */
  used: new Set<string>(),
  /** a report issued between the count and the DELETE: the count does not see it yet, the foreign key does */
  racing: false,
  audits: [] as { action: string; entity: string; entityId?: string | null; meta?: unknown; companyId: string | null }[],
  /** the raw statements, in order, with their values */
  raw: [] as { sql: string; values: unknown[] }[],
  updates: [] as Record<string, unknown>[],
  user: null as Record<string, unknown> | null,
};
let seq = 0;

type Where = Partial<Record<'id' | 'companyId' | 'projectId' | 'sha256' | 'kind', string>> & { blob?: { isNot: null } };
const KEYS = ['id', 'companyId', 'projectId', 'sha256', 'kind'] as const;
// `blob: { isNot: null }` (the download's): every file here has its bytes
const match = (f: FileRow, w: Where): boolean => KEYS.every((k) => w[k] === undefined || f[k] === w[k]);
const view = (f: FileRow) => ({
  ...f, createdBy: f.createdById ? { name: `Utente ${f.createdById}` } : null, _count: { reports: state.used.has(f.id) ? 1 : 0 },
  blob: { data: f.data }, project: { archivedAt: state.projects.find((p) => p.id === f.projectId)?.archivedAt ?? null },
});

// the advisory lock: one holder per key, the others wait in order (pg_advisory_xact_lock)
const holders = new Map<string, Promise<void>>();
async function lock(key: string): Promise<() => void> {
  const before = holders.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((r) => { release = r; });
  holders.set(key, before.then(() => mine));
  await before;
  return release;
}

function client(onLock?: (release: () => void) => void) {
  return {
    project: {
      findFirst: async ({ where }: { where: { id: string; companyId: string } }) => state.projects.find((p) => p.id === where.id && p.companyId === where.companyId) ?? null,
    },
    attachment: {
      findFirst: async ({ where }: { where: Where }) => { const f = state.files.find((x) => match(x, where)); return f ? view(f) : null; },
      findMany: async ({ where }: { where: Where }) => state.files.filter((x) => match(x, where)).map(view),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const f = state.files.find((x) => x.id === where.id); if (!f) throw new Error('P2025'); return view(f); },
      count: async ({ where }: { where: Where }) => state.files.filter((x) => match(x, where)).length,
      aggregate: async ({ where }: { where: Where }) => ({ _sum: { size: state.files.filter((x) => match(x, where)).reduce((s, x) => s + x.size, 0) || null } }),
      create: async ({ data }: { data: Omit<FileRow, 'id' | 'createdAt' | 'data'> & { blob: { create: { data: Uint8Array } } } }) => {
        // a turn of the event loop, as a real INSERT: a second upload without the lock would count before this lands
        await new Promise((r) => setTimeout(r, 5));
        const { blob, ...rest } = data;
        if (state.files.some((x) => x.projectId === rest.projectId && x.sha256 === rest.sha256)) throw new Error('unique (projectId, sha256)');
        const row: FileRow = { ...rest, id: `a${++seq}`, createdAt: new Date(Date.UTC(2026, 9, 21, 10, 0, seq)), data: blob.create.data };
        state.files.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push(data);
        const f = state.files.find((x) => x.id === where.id);
        if (!f) throw new Error('P2025');
        Object.assign(f, data);
        return f;
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const hit = state.files.filter((x) => match(x, where));
        // the deferred foreign key made immediate: a file a report lists cannot go (PostgreSQL 23503)
        if (hit.some((x) => state.used.has(x.id))) throw new Error('violates foreign key constraint (23503)');
        state.files = state.files.filter((x) => !hit.includes(x));
        return { count: hit.length };
      },
    },
    technicalReportAttachment: { count: async ({ where }: { where: { attachmentId: string } }) => (state.used.has(where.attachmentId) && !state.racing ? 1 : 0) },
    // a slice of a file's bytes (src/server/allegati/blob.ts): substring(data FROM at FOR n), 1-based
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      state.raw.push({ sql, values });
      if (!sql.includes('substring(data FROM')) throw new Error(`unexpected query: ${sql}`);
      const f = state.files.find((x) => x.id === values.at(-1));
      const from = values.length === 3 ? Number(values[0]) : 1, n = Number(values.length === 3 ? values[1] : values[0]);
      return f ? [{ part: f.data.subarray(from - 1, from - 1 + n) }] : [];
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      state.raw.push({ sql, values });
      if (sql.includes('pg_advisory_xact_lock')) onLock?.(await lock(`${String(values[0])}:${String(values[1])}`));
      return 1;
    },
  };
}

export const db = {
  ...client(),
  $transaction: async <T>(fn: (tx: ReturnType<typeof client>) => Promise<T>): Promise<T> => {
    const held: (() => void)[] = [];
    try {
      return await fn(client((r) => held.push(r)));
    } finally {
      for (const r of held) r();
    }
  },
};

mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => state.user } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: (typeof state.audits)[number]) => { state.audits.push(a); } } });
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => undefined, warn: () => undefined, error: () => undefined } } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });

const { capsOf } = await import(src('lib/rbac.ts'));

/** Signs in a user of a role (company c1 unless said), read-only or not. */
export function as(role: string, opts: { companyId?: string; readOnly?: boolean; id?: string; mustChangePassword?: boolean } = {}): void {
  state.user = {
    id: opts.id ?? `u-${role.toLowerCase()}`, role, companyId: opts.companyId ?? 'c1', companyName: 'Ditta', name: role, email: 'x@ditta.example', locale: 'it',
    mustChangePassword: opts.mustChangePassword ?? false, readOnly: opts.readOnly ?? false, caps: capsOf(role),
  };
}

export function reset(): void {
  state.files = [];
  state.used.clear();
  state.racing = false;
  state.audits.length = 0;
  state.raw.length = 0;
  state.updates.length = 0;
  state.user = null;
  for (const p of state.projects) p.archivedAt = p.id === 'parch' ? new Date('2026-09-01') : null;
}

/** A row put straight into the database (for limits and downloads). */
export function seedFile(p: Partial<FileRow> & { projectId: string; size: number }): FileRow {
  const row: FileRow = {
    id: `s${++seq}`, companyId: state.projects.find((x) => x.id === p.projectId)?.companyId ?? 'c1', kind: 'ALTRO', title: 'Documento', component: null,
    fileName: 'doc.pdf', mime: 'application/pdf', sha256: (seq.toString(16).padStart(2, '0')).repeat(32).slice(0, 64), pages: 1, width: null, height: null,
    orientation: null, createdById: null, createdAt: new Date(), data: new Uint8Array([1]), ...p,
  };
  state.files.push(row);
  return row;
}
