// Round 44: linking a survey to an installation (src/server/collega/actions.ts, service.ts) and creating an installation
// from a survey (src/server/project-actions.ts). Over an in-memory database: the right 'rilievi:link' (a read-only
// company told so), the company of the session on both sides — another company's sheet or installation is never
// touched —, an archived installation refused, the audit rows, the rollback of a creation whose sheet is already linked,
// and the suggestions read within the company's active installations only.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { capsOf } from '@/lib/rbac';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Row = Record<string, unknown>;
class Redirect extends Error { constructor(readonly to: string) { super(`redirect ${to}`); } }

const S1 = 'cm00000000000000000000s1', S2 = 'cm00000000000000000000s2', S9 = 'cm00000000000000000000s9';
let schede: Row[] = [], projects: Row[] = [], audits: Row[] = [], session: Row | null = null, findManyWhere: Row | null = null;
const reset = () => {
  schede = [
    { id: S1, companyId: 'c1', projectId: null, deletedAt: null },
    { id: S2, companyId: 'c1', projectId: 'p1', deletedAt: null },
    { id: S9, companyId: 'c2', projectId: null, deletedAt: null },
  ];
  projects = [
    { id: 'p1', companyId: 'c1', archivedAt: null }, { id: 'p2', companyId: 'c1', archivedAt: null },
    { id: 'pa', companyId: 'c1', archivedAt: new Date() }, { id: 'px', companyId: 'c2', archivedAt: null },
  ];
  audits = [];
};
const matches = (r: Row, where: Row) => Object.entries(where).every(([k, v]) => r[k] === v);

// the three statements of service.ts, by their text and their values in order
function executeRaw(strings: TemplateStringsArray, ...v: unknown[]): number {
  const sql = strings.join('?');
  if (sql.includes('FROM "Project" AS p')) {
    const [sid, c1, pid, c2] = v, s = schede.find((r) => r.id === sid && r.companyId === c1 && r.deletedAt === null);
    const p = projects.find((r) => r.id === pid && r.companyId === c2 && r.archivedAt === null);
    if (!s || !p) return 0;
    s.projectId = p.id;
    return 1;
  }
  if (sql.includes('SET "projectId" = NULL')) {
    const [sid, c, prev] = v, s = schede.find((r) => r.id === sid && r.companyId === c && r.deletedAt === null && r.projectId === prev);
    if (!s) return 0;
    s.projectId = null;
    return 1;
  }
  const [pid, sid, c] = v, s = schede.find((r) => r.id === sid && r.companyId === c && r.deletedAt === null && r.projectId === null);
  if (!s) return 0;
  s.projectId = pid;
  return 1;
}
interface Db { [model: string]: unknown; $transaction(fn: (tx: Db) => Promise<unknown>): Promise<unknown> }
const db: Db = {
  scheda: { findFirst: async ({ where }: { where: Row }) => { const s = schede.find((r) => matches(r, where)); return s ? { projectId: s.projectId } : null; } },
  project: {
    create: async ({ data }: { data: Row }) => { const row = { id: `pn${projects.length}`, archivedAt: null, ...data }; projects.push(row); return { id: row.id }; },
    findMany: async ({ where }: { where: Row }) => { findManyWhere = where; return []; },
  },
  auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return data; } },
  $executeRaw: async (strings: TemplateStringsArray, ...v: unknown[]) => executeRaw(strings, ...v),
  // a transaction that throws leaves nothing behind
  $transaction: async (fn: (tx: Db) => Promise<unknown>) => {
    const saved = { schede: structuredClone(schede), projects: structuredClone(projects), audits: [...audits] };
    try { return await fn(db); } catch (e) { ({ schede, projects } = saved); audits = saved.audits; throw e; }
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Row) => { audits.push(a); }, auditTx: async (_tx: unknown, a: Row) => { audits.push(a); } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

let n = 0;
const signIn = (over: Row = {}) => { session = { id: `u${++n}`, role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over }; };
const form = (o: Record<string, string>) => { const f = new FormData(); f.set('locale', 'it'); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
async function run(fn: () => Promise<unknown>): Promise<string | unknown> {
  try { return await fn(); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
}
const actions = () => import(src('server/collega/actions.ts'));

beforeEach(() => { reset(); signIn(); });

test('collega: il Tecnico collega un rilievo della sua azienda a un suo impianto, con la riga nel registro', async () => {
  const { collegaRilievoAction } = await actions();
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2', da: 'rilievo' }))), `/it/app/rilievi/${S1}?lk=linked#collegamento`);
  assert.equal(schede[0]?.projectId, 'p2');
  assert.deepEqual(audits.map((a) => [a.action, a.entity, a.entityId, a.meta]), [['SCHEDA_LINKED', 'Scheda', S1, { projectId: 'p2' }]]);
  // to another installation: the log says from which
  await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p1' })));
  assert.deepEqual(audits[1]?.meta, { projectId: 'p1', from: 'p2' });
});

test('collega: senza il diritto (Commerciale, o tolto dall’azienda) o in sola lettura nulla cambia', async () => {
  const { collegaRilievoAction } = await actions();
  signIn({ role: 'SALES' });
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2' }))), `/it/app/rilievi/${S1}?lk=forbidden#collegamento`);
  signIn({ role: 'ENGINEER', caps: capsOf('ENGINEER', [{ role: 'ENGINEER', capability: 'rilievi:link', granted: false }]) });
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2' }))), `/it/app/rilievi/${S1}?lk=forbidden#collegamento`);
  signIn({ role: 'ENGINEER', readOnly: true });
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2' }))), `/it/app/rilievi/${S1}?lk=readOnly#collegamento`);
  assert.equal(schede[0]?.projectId, null);
  assert.equal(audits.length, 0);
});

test('collega: un impianto di un’altra azienda o archiviato, un rilievo di un’altra azienda — mai toccati', async () => {
  const { collegaRilievoAction } = await actions();
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'px' }))), `/it/app/rilievi/${S1}?lk=projectNotFound#collegamento`);
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'pa' }))), `/it/app/rilievi/${S1}?lk=projectNotFound#collegamento`);
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S9, impianto: 'p1' }))), `/it/app/rilievi/${S9}?lk=notFound#collegamento`);
  // from the other company's side: our sheet does not exist for it
  signIn({ companyId: 'c2' });
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'px' }))), `/it/app/rilievi/${S1}?lk=notFound#collegamento`);
  assert.deepEqual(schede.map((s) => s.projectId), [null, 'p1', null]);
  assert.equal(audits.length, 0);
  // a forged id is no sheet at all
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: '../x', impianto: 'p1' }))), '/it/app/rilievi');
});

test('scollega: dalla pagina dell’impianto torna lì, con la riga nel registro; un rilievo d’altri resta', async () => {
  const { scollegaRilievoAction } = await actions();
  assert.equal(await run(() => scollegaRilievoAction(form({ scheda: S2, impianto: 'p1', da: 'impianto' }))), '/it/app/projects/p1?lk=unlinked#rilievi');
  assert.equal(schede[1]?.projectId, null);
  assert.deepEqual(audits.map((a) => [a.action, a.meta]), [['SCHEDA_UNLINKED', { projectId: 'p1' }]]);
  signIn({ companyId: 'c2' });
  schede = schede.map((s) => (s.id === S2 ? { ...s, projectId: 'p1' } : s));
  assert.equal(await run(() => scollegaRilievoAction(form({ scheda: S2 }))), `/it/app/rilievi/${S2}?lk=notFound#collegamento`);
  assert.equal(schede[1]?.projectId, 'p1');
});

test('crea impianto dal rilievo: nasce collegato, nella stessa transazione; già collegato o senza diritto — nessun impianto', async () => {
  const { createProjectAction } = await import(src('server/project-actions.ts'));
  const create = (o: Record<string, string>) => run(() => createProjectAction({}, form({ kind: 'REPLACEMENT', name: 'Via Verdi 14', ...o })));
  const before = projects.length;
  const to = await create({ rilievo: S1 });
  assert.match(String(to), /^\/it\/app\/projects\/pn\d+\/calc$/);
  const made = projects[before];
  assert.equal(made?.companyId, 'c1');
  assert.equal(schede[0]?.projectId, made?.id);
  assert.deepEqual(audits.map((a) => a.action), ['PROJECT_CREATED', 'SCHEDA_LINKED']);
  assert.deepEqual(audits[0]?.meta, { kind: 'REPLACEMENT', rilievo: S1 });
  // the sheet already linked: the transaction is undone, no installation is left
  audits = [];
  assert.deepEqual(await create({ rilievo: S2 }), { error: 'rilievoLinked' });
  assert.equal(projects.length, before + 1);
  assert.equal(audits.length, 0);
  // another company's sheet, a role without the right to link
  assert.deepEqual(await create({ rilievo: S9 }), { error: 'notFound' });
  signIn({ caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'rilievi:link', granted: false }]) });
  assert.deepEqual(await create({ rilievo: S1 }), { error: 'forbidden' });
  assert.equal(projects.length, before + 1);
});

test('suggerimenti: solo gli impianti attivi dell’azienda dell’utente', async () => {
  const { candidatiPer } = await import(src('server/collega/queries.ts'));
  await candidatiPer({ companyId: 'c1' }, { matricola: '0123', numeroImpianto: '77', indirizzo: 'Via Verdi 14, Milano' });
  assert.equal(findManyWhere?.companyId, 'c1');
  assert.equal(findManyWhere?.archivedAt, null);
  findManyWhere = null;
  assert.deepEqual(await candidatiPer({ companyId: 'c1' }, { matricola: null, numeroImpianto: null, indirizzo: null }), []);
  assert.equal(findManyWhere, null, 'nothing to look for: no query');
});
