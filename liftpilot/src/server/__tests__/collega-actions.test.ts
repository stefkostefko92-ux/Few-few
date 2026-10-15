// Round 44: linking a survey to an installation (src/server/collega/actions.ts, service.ts) and creating an installation
// from a survey (src/server/project-actions.ts). Over an in-memory database: the right 'rilievi:link' (a read-only
// company told so), the company of the session on both sides — another company's sheet or installation is never
// touched —, an archived installation refused (as the target, and as the installation a survey leaves: read only), a link
// changed meanwhile («changed»), the audit rows, the rollback of a creation whose sheet is already linked, and the
// suggestions read within the company's active installations only — the same matricola never crowded out by the
// address; a role without 'rilievi:view' gets nothing of a survey (the installation's data with ?usa=, the reads, the
// search). The mock runs the statements as the database would; every statement's text is also checked for the company,
// trash, archive and pinning predicates, so that a predicate dropped from service.ts fails here.
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

const S1 = 'cm00000000000000000000s1', S2 = 'cm00000000000000000000s2', S3 = 'cm00000000000000000000s3', S9 = 'cm00000000000000000000s9';
let schede: Row[] = [], projects: Row[] = [], audits: Row[] = [], session: Row | null = null, findManyCalls: Row[] = [], findManyResult: (args: Row) => Row[] = () => [];
/** every raw statement run, its text with `?` for each value */
let statements: string[] = [];
/** what the next read of a sheet returns instead of the row (a link changed by someone else after this read) */
let staleRead: Row | null = null;
/** the reads of a survey's own data (the reference survey, an installation's surveys) */
let surveyReads = 0;
const SURVEY = { data: new Date(Date.UTC(2026, 9, 1)), createdAt: new Date(), updatedAt: new Date(), indirizzo: 'Via Rilievo 1, Torino', matricola: 'MX-1',
  numeroImpianto: null, marca: null, portataKg: null, capienzaPersone: null, fermate: null, ubicazioneMacchina: [], tipoImpianto: [], funiNumero: null,
  funiDiametroMm: null, funicellaDiametroMm: null, limitatoreTipo: null, operatoreMarca: null, lucePorte: null, arganoPreventivo: null, preventivoArgano: null };
const reset = () => {
  schede = [
    { id: S1, companyId: 'c1', projectId: null, deletedAt: null },
    { id: S2, companyId: 'c1', projectId: 'p1', deletedAt: null },
    { id: S3, companyId: 'c1', projectId: 'pa', deletedAt: null },
    { id: S9, companyId: 'c2', projectId: null, deletedAt: null },
  ];
  projects = [
    { id: 'p1', companyId: 'c1', archivedAt: null }, { id: 'p2', companyId: 'c1', archivedAt: null },
    { id: 'pa', companyId: 'c1', archivedAt: new Date() }, { id: 'px', companyId: 'c2', archivedAt: null },
  ];
  audits = [];
  statements = [];
  staleRead = null;
  surveyReads = 0;
  findManyCalls = [];
  findManyResult = () => [];
};
const matches = (r: Row, where: Row) => Object.entries(where).every(([k, v]) => r[k] === v);

const archivedProject = (id: unknown) => projects.find((r) => r.id === id)?.archivedAt != null;
// the three statements of service.ts, by their text and their values in order
function executeRaw(strings: TemplateStringsArray, ...v: unknown[]): number {
  const sql = strings.join('?');
  statements.push(sql);
  if (sql.includes('SET "projectId" = NULL')) {
    const [sid, c, prev, c2] = v, s = schede.find((r) => r.id === sid && r.companyId === c && r.deletedAt === null && r.projectId === prev
      && projects.some((p) => p.id === r.projectId && p.companyId === c2 && p.archivedAt === null));
    if (!s) return 0;
    s.projectId = null;
    return 1;
  }
  if (sql.includes('UPDATE "Scheda" AS s SET "projectId" = p."id"')) {
    // collega: the sheet (its company, out of the trash, still on the installation read, which is not archived) to the
    // installation (the company's, active)
    const [sid, c1, prev, pid, c2] = v;
    const s = schede.find((r) => r.id === sid && r.companyId === c1 && r.deletedAt === null && (r.projectId ?? null) === (prev ?? null) && !archivedProject(r.projectId));
    const p = projects.find((r) => r.id === pid && r.companyId === c2 && r.archivedAt === null);
    if (!s || !p) return 0;
    s.projectId = p.id;
    return 1;
  }
  const [pid, sid, c] = v, s = schede.find((r) => r.id === sid && r.companyId === c && r.deletedAt === null && r.projectId === null);
  if (!s) return 0;
  s.projectId = pid;
  return 1;
}
interface Db { [model: string]: unknown; $transaction(fn: (tx: Db) => Promise<unknown>): Promise<unknown> }
const db: Db = {
  scheda: {
    findFirst: async ({ where, select }: { where: Row; select?: Row }) => {
      const s = schede.find((r) => matches(r, where));
      // the reference survey (collega/queries.ts): its data
      if (select && 'indirizzo' in select) { surveyReads++; return s ? { ...SURVEY, id: s.id } : null; }
      if (!s) return null;
      const read = staleRead ?? s;
      staleRead = null;
      const p = projects.find((r) => r.id === read.projectId);
      return { projectId: read.projectId, project: p ? { archivedAt: p.archivedAt } : null };
    },
    findMany: async () => { surveyReads++; return []; },
  },
  project: {
    create: async ({ data }: { data: Row }) => { const row = { id: `pn${projects.length}`, archivedAt: null, ...data }; projects.push(row); return { id: row.id }; },
    findFirst: async ({ where }: { where: Row }) => { const p = projects.find((r) => matches(r, where)); return p ? { id: p.id } : null; },
    findMany: async (args: Row) => { findManyCalls.push(args); return findManyResult(args); },
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
  assert.deepEqual(schede.map((s) => s.projectId), [null, 'p1', 'pa', null]);
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
  const create = (o: Record<string, string>) => run(() => createProjectAction({}, form({ name: 'Via Verdi 14', ...o })));
  const before = projects.length;
  const to = await create({ rilievo: S1 });
  assert.match(String(to), /^\/it\/app\/projects\/pn\d+\/calc$/);
  const made = projects[before];
  assert.equal(made?.companyId, 'c1');
  assert.equal(schede[0]?.projectId, made?.id);
  assert.deepEqual(audits.map((a) => a.action), ['PROJECT_CREATED', 'SCHEDA_LINKED']);
  assert.deepEqual(audits[0]?.meta, { rilievo: S1 }, 'no kind (round 45)');
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

test('suggerimenti: solo gli impianti attivi dell’azienda dell’utente; la stessa matricola mai esclusa dagli indirizzi', async () => {
  const { candidatiPer, suggerimentiPer, MAX_CODICE, MAX_INDIRIZZO } = await import(src('server/collega/queries.ts'));
  await candidatiPer({ companyId: 'c1' }, { matricola: '0123', numeroImpianto: '77', indirizzo: 'Via Verdi 14, Milano' });
  assert.equal(findManyCalls.length, 2, 'the codes and the address apart');
  for (const call of findManyCalls) {
    const where = call.where as Row;
    assert.equal(where.companyId, 'c1');
    assert.equal(where.archivedAt, null);
  }
  const [code, address] = findManyCalls as { where: { OR: Row[] }; take: number }[];
  assert.equal(code?.take, MAX_CODICE);
  assert.ok(!JSON.stringify(code?.where).includes('Verdi') && !JSON.stringify(code?.where).includes('milano'), 'no address word in the query by code');
  assert.equal(address?.take, MAX_INDIRIZZO);
  findManyCalls = [];
  assert.deepEqual(await candidatiPer({ companyId: 'c1' }, { matricola: null, numeroImpianto: null, indirizzo: null }), []);
  assert.equal(findManyCalls.length, 0, 'nothing to look for: no query');
  // 50 installations of the same city changed later than the one of the same matricola: that one still comes first
  const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i));
  const city = Array.from({ length: 50 }, (_, i) => ({ id: `pc${i}`, name: `Via Garibaldi ${i}`, address: `Via Garibaldi ${i}`, city: 'Milano',
    province: 'MI', plantNumber: null, updatedAt: at(100 + i), schede: [] }));
  const match = { id: 'pm', name: 'Condominio Verdi', address: 'Via Verdi 14', city: 'Milano', province: 'MI', plantNumber: '0123', updatedAt: at(1), schede: [] };
  findManyResult = (args) => (JSON.stringify(args.where).includes('plantNumber') ? [match] : city);
  const out = await suggerimentiPer({ companyId: 'c1' }, { matricola: '0123', numeroImpianto: null, indirizzo: 'Via Verdi 14, Milano', projectId: null });
  assert.equal(out[0]?.id, 'pm');
  assert.deepEqual(out[0]?.motivi, ['matricola', 'indirizzo']);
});

test('i predicati delle istruzioni: azienda su entrambi i lati, cestino, archivio, collegamento letto', async () => {
  const { collegaRilievoAction, scollegaRilievoAction } = await actions();
  await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2' })));
  await run(() => scollegaRilievoAction(form({ scheda: S1 })));
  const [link, unlink] = statements;
  for (const re of [/s\."companyId" = \?/, /s\."deletedAt" IS NULL/, /s\."projectId" IS NOT DISTINCT FROM \?/, /q\."archivedAt" IS NOT NULL/,
    /p\."companyId" = \?/, /p\."archivedAt" IS NULL/]) assert.match(link ?? '', re);
  for (const re of [/s\."companyId" = \?/, /s\."deletedAt" IS NULL/, /s\."projectId" = \?/, /p\."companyId" = \?/, /p\."archivedAt" IS NULL/]) assert.match(unlink ?? '', re);
});

test('impianto archiviato: in sola lettura, i suoi rilievi non si scollegano né si spostano', async () => {
  const { collegaRilievoAction, scollegaRilievoAction } = await actions();
  assert.equal(await run(() => scollegaRilievoAction(form({ scheda: S3 }))), `/it/app/rilievi/${S3}?lk=archived#collegamento`);
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S3, impianto: 'p2' }))), `/it/app/rilievi/${S3}?lk=archived#collegamento`);
  assert.equal(schede[2]?.projectId, 'pa');
  assert.equal(audits.length, 0);
  assert.equal(statements.length, 0, 'refused before any write');
});

test('collegamento cambiato nel frattempo: nulla si scrive, il registro non nomina un «from» sbagliato', async () => {
  const { collegaRilievoAction, scollegaRilievoAction } = await actions();
  // read as not linked, but someone linked it to p1 meanwhile
  staleRead = { projectId: null };
  schede[0] = { ...schede[0], projectId: 'p1' };
  assert.equal(await run(() => collegaRilievoAction(form({ scheda: S1, impianto: 'p2' }))), `/it/app/rilievi/${S1}?lk=changed#collegamento`);
  assert.equal(schede[0]?.projectId, 'p1');
  // read as on p1, but moved to p2 meanwhile: the unlink does not take it off p2
  staleRead = { projectId: 'p1' };
  schede[0] = { ...schede[0], projectId: 'p2' };
  assert.equal(await run(() => scollegaRilievoAction(form({ scheda: S1 }))), `/it/app/rilievi/${S1}?lk=changed#collegamento`);
  assert.equal(schede[0]?.projectId, 'p2');
  assert.equal(audits.length, 0);
});

test('senza «rilievi:view» nulla del rilievo: i dati dell’impianto con ?usa=, le letture, la ricerca degli impianti', async () => {
  const { usaDatiImpianto } = await import(src('server/collega/forms.ts'));
  const { rilievoDiRiferimento, rilieviImpianto } = await import(src('server/collega/queries.ts'));
  const { listProjects } = await import(src('server/project-list.ts'));
  const sees = { id: 'u1', role: 'TECHNICIAN', companyId: 'c1' };
  const blind = { ...sees, caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'rilievi:view', granted: false }]) };
  const u = await usaDatiImpianto(sees, 'p1', 'indirizzo');
  assert.deepEqual([u?.field, u?.value, typeof u?.date], ['address', 'Via Rilievo 1, Torino', 'string']);
  assert.deepEqual([(await usaDatiImpianto(sees, 'p1', 'matricola'))?.field, await usaDatiImpianto(sees, 'p1', 'portata')], ['plantNumber', null]);
  surveyReads = 0;
  for (const usa of ['indirizzo', 'matricola']) assert.equal(await usaDatiImpianto(blind, 'p1', usa), null);
  assert.equal(await rilievoDiRiferimento(blind, 'p1'), null);
  assert.deepEqual(await rilieviImpianto(blind, 'p1'), []);
  assert.equal(surveyReads, 0, 'the survey is not even read');
  // the search of the installations: a linked survey's matricola or number only for whoever sees the surveys
  findManyCalls = [];
  await listProjects(blind, false, ['MX-1']);
  await listProjects(sees, false, ['MX-1']);
  const [b, v] = findManyCalls.map((c) => JSON.stringify(c.where));
  assert.ok(b?.includes('plantNumber') && !b.includes('schede'), 'without the right: name, address, municipality, matricola only');
  assert.ok(v?.includes('schede'));
});
