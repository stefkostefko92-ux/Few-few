// A form's draft (src/server/draft-actions.ts, drafts.ts): the draft is the user's company's, the project not archived,
// a survey's calculation is that project's, and a draft is no larger than DRAFT_MAX. A draft kept for another company is a leak.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { defaultLift } from '@/lib/lift';
import { z } from 'zod';
import * as realDraft from '@/lib/draft-input';

const { DRAFT_MAX, liftDraftSchema } = realDraft;

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Row = Record<string, unknown>;
const PROJECTS: Row[] = [
  { id: 'p1', companyId: 'c1', archivedAt: null },
  { id: 'parch', companyId: 'c1', archivedAt: new Date(0) },
  { id: 'pother', companyId: 'c2', archivedAt: null },
];
const CALCS: Row[] = [
  { id: 'calc1', projectId: 'p1', companyId: 'c1' },
  { id: 'calcother', projectId: 'pother', companyId: 'c2' },
  { id: 'calcp2', projectId: 'pother', companyId: 'c1' },
];
// the where of a Prisma query: `archivedAt: null` matches a project not archived
const matches = (r: Row, w: Row) => Object.entries(w).every(([k, v]) => r[k] === v);
let upserts: Row[] = [], deletes: Row[] = [];
let session: Row | null = null;
let draftRow: Row | null = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  project: { findFirst: async ({ where }: { where: Row }) => PROJECTS.find((p) => matches(p, where)) ?? null },
  calculation: { findFirst: async ({ where }: { where: Row }) => CALCS.find((c) => matches(c, where)) ?? null },
  formDraft: {
    upsert: async (a: Row) => { upserts.push(a); return { updatedAt: new Date('2026-10-02T10:00:00Z') }; },
    deleteMany: async ({ where }: { where: Row }) => { deletes.push(where); return { count: 1 }; },
    findFirst: async ({ where }: { where: Row }) => (draftRow && matches(draftRow, where) ? draftRow : null),
  },
} } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });

// the size check is told apart from the schema's: with `lax` the schema takes anything, so only DRAFT_MAX can refuse
let lax = false;
mock.module(src('lib/draft-input.ts'), { namedExports: { ...realDraft, draftSchemaOf: (scope: never) => (lax ? z.any() : realDraft.draftSchemaOf(scope)) } });

let n = 0;
const signIn = (over: Row = {}) => { session = { id: `u${++n}`, role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const lift = () => ({ inputs: defaultLift(), blank: [] });
const actions = () => import(src('server/draft-actions.ts'));

beforeEach(() => { upserts = []; deletes = []; draftRow = null; lax = false; signIn(); });

test('un modulo del proprio impianto si tiene: risponde con l’ora e scrive per la propria ditta', async () => {
  const { saveDraftAction } = await actions();
  const r = await saveDraftAction({ projectId: 'p1', scope: 'lift', data: lift() });
  assert.deepEqual(r, { ok: true, at: '2026-10-02T10:00:00.000Z' });
  assert.equal(upserts.length, 1);
  assert.deepEqual((upserts[0].create as Row).companyId, 'c1');
  assert.deepEqual(upserts[0].where, { projectId_scope: { projectId: 'p1', scope: 'lift' } });
});

test('senza sessione: unauthorized; con la password da cambiare o senza il diritto: forbidden', async () => {
  const { saveDraftAction } = await actions();
  session = null;
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: lift() }), { ok: false, error: 'unauthorized' });
  signIn({ mustChangePassword: true });
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: lift() }), { ok: false, error: 'forbidden' });
  signIn({ role: 'SALES' });
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: lift() }), { ok: false, error: 'forbidden' });
  assert.equal(upserts.length, 0);
});

test('più di DRAFT_MAX caratteri: invalidFields, nulla scritto (anche se lo schema li accetterebbe)', async () => {
  const { saveDraftAction } = await actions();
  lax = true;
  assert.equal((await saveDraftAction({ projectId: 'p1', scope: 'lift', data: { pad: 'x'.repeat(100) } })).ok, true, 'piccolo: passa');
  upserts = [];
  const big = { pad: 'x'.repeat(DRAFT_MAX) };
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: big }), { ok: false, error: 'invalidFields' });
  assert.equal(upserts.length, 0);
});

test('dati che il modulo non accetta: invalidFields', async () => {
  const { saveDraftAction } = await actions();
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: { nonsense: 1 } }), { ok: false, error: 'invalidFields' });
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'lift', data: undefined }), { ok: false, error: 'invalidFields' });
  assert.equal(upserts.length, 0);
});

test('ambito o id non validi: invalidFields', async () => {
  const { saveDraftAction } = await actions();
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'bogus', data: lift() }), { ok: false, error: 'invalidFields' });
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'room:../x', data: lift() }), { ok: false, error: 'invalidFields' });
  assert.deepEqual(await saveDraftAction({ projectId: 42, scope: 'lift', data: lift() }), { ok: false, error: 'invalidFields' });
});

test('impianto di un’altra ditta o archiviato: notFound, nulla scritto né cancellato', async () => {
  const { saveDraftAction, discardDraftAction } = await actions();
  for (const projectId of ['pother', 'parch', 'missing']) {
    assert.deepEqual(await saveDraftAction({ projectId, scope: 'lift', data: lift() }), { ok: false, error: 'notFound' }, projectId);
    assert.deepEqual(await discardDraftAction({ projectId, scope: 'lift' }), { ok: false, error: 'notFound' }, projectId);
  }
  assert.equal(upserts.length + deletes.length, 0);
});

test('room:<id>: il calcolo di un altro impianto o di un’altra ditta è notFound', async () => {
  const { saveDraftAction, discardDraftAction } = await actions();
  for (const scope of ['room:calcother', 'room:calcp2', 'room:missing']) {
    assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope, data: { survey: {}, blank: [] } }), { ok: false, error: 'notFound' }, scope);
    assert.deepEqual(await discardDraftAction({ projectId: 'p1', scope }), { ok: false, error: 'notFound' }, scope);
  }
  assert.equal(upserts.length + deletes.length, 0);
});

test('room:<id> del proprio impianto: l’ambito passa il controllo (poi decide la forma dei dati)', async () => {
  const { discardDraftAction } = await actions();
  const r = await discardDraftAction({ projectId: 'p1', scope: 'room:calc1' });
  assert.equal(r.ok, true);
  assert.deepEqual(deletes, [{ companyId: 'c1', projectId: 'p1', scope: 'room:calc1' }]);
});

test('scartare: solo della propria ditta', async () => {
  const { discardDraftAction } = await actions();
  assert.equal((await discardDraftAction({ projectId: 'p1', scope: 'calc' })).ok, true);
  assert.deepEqual(deletes, [{ companyId: 'c1', projectId: 'p1', scope: 'calc' }]);
});

test('il 601° cambiamento in 10 minuti: rateLimited', async () => {
  const { discardDraftAction } = await actions();
  for (let i = 0; i < 600; i++) assert.equal((await discardDraftAction({ projectId: 'p1', scope: 'calc' })).ok, true);
  assert.deepEqual(await discardDraftAction({ projectId: 'p1', scope: 'calc' }), { ok: false, error: 'rateLimited' });
});

test('readDraft: bozza leggibile con l’ora; bozza che non passa lo schema: nessuna; altra ditta: nessuna', async () => {
  const { readDraft } = await import(src('server/drafts.ts'));
  const user = { id: 'u', companyId: 'c1' } as never;
  const updatedAt = new Date('2026-10-02T10:00:00Z');
  draftRow = { projectId: 'p1', scope: 'lift', companyId: 'c1', updatedAt, data: lift() };
  const ok = await readDraft(user, 'p1', 'lift', liftDraftSchema);
  assert.equal(ok?.at, updatedAt.toISOString());
  draftRow = { ...draftRow, data: { nonsense: true } };
  assert.equal(await readDraft(user, 'p1', 'lift', liftDraftSchema), null);
  draftRow = { projectId: 'p1', scope: 'lift', companyId: 'c2', updatedAt, data: lift() };
  assert.equal(await readDraft(user, 'p1', 'lift', liftDraftSchema), null);
});

test('dropDraft: cancella per ditta, impianto e ambito', async () => {
  const { dropDraft } = await import(src('server/drafts.ts'));
  await dropDraft('c1', 'p1', 'lift');
  assert.deepEqual(deletes, [{ companyId: 'c1', projectId: 'p1', scope: 'lift' }]);
});
