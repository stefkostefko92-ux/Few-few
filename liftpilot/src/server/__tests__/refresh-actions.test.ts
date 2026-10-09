// «Aggiorna con il software attuale» (src/server/refresh-actions.ts): a record the engines no longer reproduce is made
// again once — never a duplicate of a legal document: not a record still reproduced, not one already made again (the
// audit keeps `updates`), not two at the same moment. What no longer passes opens the form. Always the user's company.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, snapshotOf } from '@/calc/snapshot';
import { LIFT_ENGINE_VERSION, defaultLift, deriveLift } from '@/lib/lift';
import { shaftHash } from '@/lib/shaft-hash';
import { snapshotHash } from '@/lib/snapshot-hash';
import { shaftSnapshot } from '@/shaft';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Row = Record<string, unknown>;
class Redirect extends Error { constructor(readonly to: string) { super(`redirect ${to}`); } }

// ---- the database as a company sees it
const db: { calc: Row[]; lift: Row[]; room: Row[]; audit: Row[] } = { calc: [], lift: [], room: [], audit: [] };
const visible = (r: Row, w: Row) => r.id === w.id && r.companyId === w.companyId
  && (!('project' in w) || (r.project as { archivedAt: unknown }).archivedAt === null);
const calls: { calc: unknown[][]; lift: unknown[][]; room: unknown[][] } = { calc: [], lift: [], room: [] };
let gate: Promise<void> | null = null;
let created: { ok: true; id: string } | { ok: false; error: string } = { ok: true, id: 'new1' };
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  calculation: { findFirst: async ({ where }: { where: Row }) => db.calc.find((r) => visible(r, where)) ?? null },
  liftDesign: { findFirst: async ({ where }: { where: Row }) => db.lift.find((r) => visible(r, where)) ?? null },
  roomDesign: { findFirst: async ({ where }: { where: Row }) => db.room.find((r) => visible(r, where)) ?? null },
  auditLog: { findFirst: async ({ where }: { where: { companyId: string; action: string; meta: { equals: string } } }) =>
    db.audit.find((a) => a.companyId === where.companyId && a.action === where.action && a.updates === where.meta.equals) ?? null },
} } });
mock.module(src('server/save.ts'), { namedExports: {
  createCalculation: async (...a: unknown[]) => { calls.calc.push(a); await gate; return created; },
  createLiftDesign: async (...a: unknown[]) => { calls.lift.push(a); await gate; return created; },
  createRoomDesign: async (...a: unknown[]) => { calls.room.push(a); return created; },
} });
let session: Row | null = null;
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

const actions = () => import(src('server/refresh-actions.ts'));
let n = 0;
const signIn = (over: Row = {}) => { session = { id: `u${++n}`, role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const fd = (id: string) => { const f = new FormData(); f.set('id', id); f.set('locale', 'it'); return f; };
/** Where an action ends: it always ends in a redirect. */
async function go(run: (f: FormData) => Promise<void>, id: string): Promise<string> {
  try { await run(fd(id)); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
  throw new Error('no redirect');
}

const APP = '/it/app';
const project = (over: Row = {}) => ({ kind: 'REPLACEMENT', archivedAt: null, ...over });
const snap = (V: typeof PRESETS.B) => { const s = snapshotOf(V); return { inputs: s.values, sha256: snapshotHash(s) }; };
const calcRow = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', projectId: 'p1', label: 'prima', collaudo: null, liftDesign: null, shaftDesign: null, roomDesigns: [], project: project(), engineVersion: ENGINE_VERSION,
  ...snap(PRESETS.B), ...over,
});
const stale = { sha256: '0'.repeat(64) };
const liftRow = (id: string, over: Row = {}): Row => {
  const inputs = defaultLift(), dv = deriveLift(inputs), S = shaftSnapshot(dv.shaft);
  return {
    id, companyId: 'c1', projectId: 'p1', label: 'prima', inputs, source: null, engineVersion: LIFT_ENGINE_VERSION, project: project({ kind: 'FULL' }),
    shaftDesign: { sha256: shaftHash(S.snapshot) }, calculation: { sha256: snapshotHash(snapshotOf(dv.values)) }, ...over,
  };
};

beforeEach(() => {
  db.calc = []; db.lift = []; db.room = []; db.audit = [];
  calls.calc = []; calls.lift = []; calls.room = []; gate = null; created = { ok: true, id: 'new1' }; signIn();
});

// ---- who may ask
test('senza sessione: all’accesso', async () => {
  const { refreshCalculationAction } = await actions();
  session = null;
  assert.equal(await go(refreshCalculationAction, 'c1'), '/it/login');
});

test('password da cambiare, senza il diritto di salvare, id non valido: al tabellone, nulla rifatto', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  signIn({ mustChangePassword: true });
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
  signIn({ role: 'SALES' });
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
  signIn();
  assert.equal(await go(refreshCalculationAction, '../x'), APP);
  assert.equal(calls.calc.length, 0);
});

test('la 31ª richiesta in 10 minuti: al tabellone', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1')];
  for (let i = 0; i < 30; i++) assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/old1`, `richiesta ${i + 1}`);
  assert.equal(await go(refreshCalculationAction, 'old1'), APP);
});

test('il calcolo di un’altra ditta o archiviato: al tabellone, nulla rifatto', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('theirs', { ...stale, companyId: 'c2' }), calcRow('arch', { ...stale, project: project({ archivedAt: new Date(0) }) })];
  assert.equal(await go(refreshCalculationAction, 'theirs'), APP);
  assert.equal(await go(refreshCalculationAction, 'arch'), APP);
  assert.equal(calls.calc.length, 0);
});

// ---- a replacement's calculation
test('calcolo ancora riprodotto: alla sua pagina, nessuna copia', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('ok1')];
  assert.equal(await go(refreshCalculationAction, 'ok1'), `${APP}/calculations/ok1`);
  assert.equal(calls.calc.length, 0);
});

test('calcolo vecchio: rifatto una volta, con la stessa etichetta, e la pagina del nuovo dice da quale', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1);
  const [, projectId, , label, , from] = calls.calc[0];
  assert.deepEqual([projectId, label, from], ['p1', 'prima', 'old1']);
});

test('calcolo già rifatto (il registro ha `updates`): al nuovo con ?da=, nessun secondo record', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  db.audit = [{ companyId: 'c1', action: 'CALCULATION_SAVED', updates: 'old1', entityId: 'made1' }];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/made1?da=old1`);
  assert.equal(calls.calc.length, 0);
});

test('il registro di un’altra ditta non conta come «già rifatto»', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  db.audit = [{ companyId: 'c2', action: 'CALCULATION_SAVED', updates: 'old1', entityId: 'theirs1' }];
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
  assert.equal(calls.calc.length, 1);
});

test('due richieste nello stesso momento: la seconda trova «occupato», un solo record; poi si può ancora', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  let open!: () => void;
  gate = new Promise<void>((r) => { open = r; });
  const first = go(refreshCalculationAction, 'old1');
  await new Promise((r) => setImmediate(r)); // the first is inside the save
  assert.equal(calls.calc.length, 1);
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/old1`, 'la seconda torna al vecchio');
  assert.equal(calls.calc.length, 1, 'nessun secondo record');
  open();
  assert.equal(await first, `${APP}/calculations/new1?da=old1`);
  gate = null;
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`, 'il blocco è tolto dopo');
});

test('il blocco è tolto anche se il salvataggio fallisce', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  created = { ok: false, error: 'invalidFields' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/projects/p1/calc?from=old1&aggiorna=1`);
  created = { ok: true, id: 'new1' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/calculations/new1?da=old1`);
});

test('dati che il software non accetta più: si apre il modulo su di essi, nessun record', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('old1', stale)];
  created = { ok: false, error: 'invalidFields' };
  assert.equal(await go(refreshCalculationAction, 'old1'), `${APP}/projects/p1/calc?from=old1&aggiorna=1`);
  db.calc = [calcRow('bad1', { inputs: { nonsense: true }, sha256: '0'.repeat(64) })];
  calls.calc = [];
  assert.equal(await go(refreshCalculationAction, 'bad1'), `${APP}/projects/p1/calc?from=bad1&aggiorna=1`);
  assert.equal(calls.calc.length, 0, 'valori illeggibili: non si salva');
});

test('archivio di un progetto intero (non una sostituzione, o con progetto del vano): si rifà dal modulo, niente copia', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [
    calcRow('full1', { ...stale, project: project({ kind: 'FULL' }) }),
    calcRow('shaft1', { ...stale, shaftDesign: { id: 'd1' } }),
  ];
  assert.equal(await go(refreshCalculationAction, 'full1'), `${APP}/projects/p1/progetto`);
  assert.equal(await go(refreshCalculationAction, 'shaft1'), `${APP}/projects/p1/progetto`);
  assert.equal(calls.calc.length + calls.lift.length, 0);
});

test('calcolo di un progetto dell’impianto: tocca al progetto rifarlo', async () => {
  const { refreshCalculationAction } = await actions();
  db.calc = [calcRow('clift1', { ...stale, liftDesign: { id: 'lift1' } })];
  db.lift = [liftRow('lift1')];
  assert.equal(await go(refreshCalculationAction, 'clift1'), `${APP}/lift-designs/lift1`, 'riprodotto: alla sua pagina');
  assert.equal(calls.lift.length + calls.calc.length, 0);
});

// ---- a lift design
test('progetto dell’impianto riprodotto: alla sua pagina, nessuna copia', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1')];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  assert.equal(calls.lift.length, 0);
});

test('progetto dell’impianto vecchio: rifatto una volta; già rifatto: al nuovo senza secondo record', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/new1?da=lift1`);
  assert.equal(calls.lift.length, 1);
  assert.equal(calls.lift[0][5], 'lift1', 'il record dice quale rifà');
  db.audit = [{ companyId: 'c1', action: 'LIFT_DESIGN_SAVED', updates: 'lift1', entityId: 'made1' }];
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/made1?da=lift1`);
  assert.equal(calls.lift.length, 1);
});

test('progetto dell’impianto: due richieste insieme, un solo record', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  let open!: () => void;
  gate = new Promise<void>((r) => { open = r; });
  const first = go(refreshLiftDesignAction, 'lift1');
  await new Promise((r) => setImmediate(r));
  assert.equal(await go(refreshLiftDesignAction, 'lift1'), `${APP}/lift-designs/lift1`);
  open();
  assert.equal(await first, `${APP}/lift-designs/new1?da=lift1`);
  assert.equal(calls.lift.length, 1);
});

test('progetto dell’impianto che non passa più: al modulo con ?from= e il segno che lo dice in cima (aggiorna=1)', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('lift1', { engineVersion: '0.0.0' })];
  created = { ok: false, error: 'invalidFields' };
  const to = await go(refreshLiftDesignAction, 'lift1');
  assert.equal(to, `${APP}/projects/p1/progetto?from=lift1&aggiorna=1`);
  // the form reads the mark and says at its top why it opened (refresh-form.ts); opened from the record's page, it does not
  const { openedByRefresh } = await import(src('lib/refresh-form.ts'));
  assert.equal(openedByRefresh(Object.fromEntries(new URL(to, 'http://x').searchParams)), true);
  assert.equal(openedByRefresh({ from: 'lift1' }), false);
});

test('progetto dell’impianto di un’altra ditta o archiviato: al tabellone', async () => {
  const { refreshLiftDesignAction } = await actions();
  db.lift = [liftRow('theirs', { engineVersion: '0.0.0', companyId: 'c2' }), liftRow('arch', { engineVersion: '0.0.0', project: project({ archivedAt: new Date(0), kind: 'FULL' }) })];
  assert.equal(await go(refreshLiftDesignAction, 'theirs'), APP);
  assert.equal(await go(refreshLiftDesignAction, 'arch'), APP);
  assert.equal(calls.lift.length, 0);
});

// ---- a replacement's machine room
const roomRow = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', label: 'locale', inputs: { nonsense: true }, sha256: '0'.repeat(64), project: project(), calculation: calcRow('old1', stale), ...over,
});

test('machinale di un progetto intero: si rifà dal modulo, niente copia', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1', { project: project({ kind: 'FULL' }) })];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/projects/p1/progetto`);
  assert.equal(calls.calc.length + calls.room.length, 0);
});

test('machinale già rifatto: al nuovo con ?da=, nessun record', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1')];
  db.audit = [{ companyId: 'c1', action: 'ROOM_DESIGN_SAVED', updates: 'room1', entityId: 'made1' }];
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/room-designs/made1?da=room1`);
  assert.equal(calls.calc.length + calls.room.length, 0);
});

test('machinale con rilievo che il nuovo calcolo non prende più: si rifà il calcolo, il rilievo va al suo modulo', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('room1')];
  db.calc = [calcRow('new1')]; // the calculation made again, as the database then has it
  assert.equal(await go(refreshRoomDesignAction, 'room1'), `${APP}/calculations/new1/locale?from=room1&aggiorna=1`);
  assert.equal(calls.calc.length, 1);
  assert.equal(calls.room.length, 0, 'il rilievo illeggibile non è salvato');
});

test('machinale di un’altra ditta o archiviato: al tabellone', async () => {
  const { refreshRoomDesignAction } = await actions();
  db.room = [roomRow('theirs', { companyId: 'c2' }), roomRow('arch', { project: project({ archivedAt: new Date(0) }) })];
  assert.equal(await go(refreshRoomDesignAction, 'theirs'), APP);
  assert.equal(await go(refreshRoomDesignAction, 'arch'), APP);
  assert.equal(calls.calc.length + calls.room.length, 0);
});
