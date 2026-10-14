// The database, the session and the saves as refresh-actions.ts sees them, for its tests (refresh-actions.test.ts,
// refresh-room.test.ts): the module mocks are set up on import, every test starts from an empty company signed in as the
// Progettista. What a test changes in the middle (no session, a held save, a failed save) is in `state`.
import { mock, beforeEach } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, snapshotOf } from '@/calc/snapshot';
import { LIFT_ENGINE_VERSION, defaultLift, deriveLift } from '@/lib/lift';
import { shaftHash } from '@/lib/shaft-hash';
import { snapshotHash } from '@/lib/snapshot-hash';
import { shaftSnapshot } from '@/shaft';

export const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

export type Row = Record<string, unknown>;
class Redirect extends Error { constructor(readonly to: string) { super(`redirect ${to}`); } }

// ---- the database as a company sees it
export const db: { calc: Row[]; lift: Row[]; room: Row[]; audit: Row[] } = { calc: [], lift: [], room: [], audit: [] };
const visible = (r: Row, w: Row) => r.id === w.id && r.companyId === w.companyId
  && (!('project' in w) || (r.project as { archivedAt: unknown }).archivedAt === null);
export const calls: { calc: unknown[][]; lift: unknown[][]; room: unknown[][] } = { calc: [], lift: [], room: [] };
export const state: { session: Row | null; gate: Promise<void> | null; created: { ok: true; id: string } | { ok: false; error: string } } = {
  session: null, gate: null, created: { ok: true, id: 'new1' },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  calculation: { findFirst: async ({ where }: { where: Row }) => db.calc.find((r) => visible(r, where)) ?? null },
  liftDesign: { findFirst: async ({ where }: { where: Row }) => db.lift.find((r) => visible(r, where)) ?? null },
  roomDesign: { findFirst: async ({ where }: { where: Row }) => db.room.find((r) => visible(r, where)) ?? null },
  auditLog: { findFirst: async ({ where }: { where: { companyId: string; action: string; meta: { equals: string } } }) =>
    db.audit.find((a) => a.companyId === where.companyId && a.action === where.action && a.updates === where.meta.equals) ?? null },
} } });
mock.module(src('server/save.ts'), { namedExports: {
  createCalculation: async (...a: unknown[]) => { calls.calc.push(a); await state.gate; return state.created; },
  createLiftDesign: async (...a: unknown[]) => { calls.lift.push(a); await state.gate; return state.created; },
  createRoomDesign: async (...a: unknown[]) => { calls.room.push(a); return state.created; },
} });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => state.session } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

export const actions = () => import(src('server/refresh-actions.ts'));
let n = 0;
// the Progettista makes the records and fills in every form (the calculator's, the project's: round 42)
export const signIn = (over: Row = {}) => { state.session = { id: `u${++n}`, role: 'ENGINEER', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const fd = (id: string) => { const f = new FormData(); f.set('id', id); f.set('locale', 'it'); return f; };
/** Where an action ends: it always ends in a redirect. */
export async function go(run: (f: FormData) => Promise<void>, id: string): Promise<string> {
  try { await run(fd(id)); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
  throw new Error('no redirect');
}

export const APP = '/it/app';
export const project = (over: Row = {}) => ({ kind: 'REPLACEMENT', archivedAt: null, ...over });
const snap = (V: typeof PRESETS.B) => { const s = snapshotOf(V); return { inputs: s.values, sha256: snapshotHash(s) }; };
export const calcRow = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', projectId: 'p1', label: 'prima', collaudo: null, intervento: null, liftDesign: null, shaftDesign: null, roomDesigns: [], project: project(), engineVersion: ENGINE_VERSION,
  ...snap(PRESETS.B), ...over,
});
export const stale = { sha256: '0'.repeat(64) };
export const liftRow = (id: string, over: Row = {}): Row => {
  const inputs = defaultLift(), dv = deriveLift(inputs), S = shaftSnapshot(dv.shaft);
  return {
    id, companyId: 'c1', projectId: 'p1', label: 'prima', inputs, source: null, engineVersion: LIFT_ENGINE_VERSION, project: project({ kind: 'FULL' }),
    shaftDesign: { sha256: shaftHash(S.snapshot) }, calculation: { sha256: snapshotHash(snapshotOf(dv.values)) }, ...over,
  };
};

beforeEach(() => {
  db.calc = []; db.lift = []; db.room = []; db.audit = [];
  calls.calc = []; calls.lift = []; calls.room = []; state.gate = null; state.created = { ok: true, id: 'new1' }; signIn();
});
