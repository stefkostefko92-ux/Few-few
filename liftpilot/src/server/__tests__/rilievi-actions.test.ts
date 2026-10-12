// Rilievi — the server side of the survey sheets end to end over an in-memory database, as rilievi's integration tests
// (schede, campi, ordini, aziende; commit 174a1e3aa) for what does not need PostgreSQL: a sheet saved within the
// company with its author, conditional chain, measurements and supplier module, one audit row without content; the
// errors keep the input; the version guard (409: the input stays, nothing overwritten, the next save knowingly wins);
// another company's sheet is "not found" everywhere; the trash by the rights of each role; the PDFs' answers.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Prisma } from '@prisma/client';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Row = Record<string, unknown>;
const schede: Row[] = [], misure: Row[] = [], audits: Row[] = [];
let clock = Date.parse('2026-10-12T08:00:00Z'), seq = 0;
const tick = () => new Date((clock += 1000));
const NAMES: Record<string, string> = { u1: 'Mario Bianchi', u2: 'Luca Verdi', u3: 'Anna Neri', u4: 'Sara Blu', u9: 'Altra Ditta' };

const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => {
  if (v === null) return row[k] === null;
  if (v instanceof Date) return row[k] instanceof Date && (row[k] as Date).getTime() === v.getTime();
  if (v && typeof v === 'object' && 'not' in v) return row[k] !== (v as { not: unknown }).not;
  if (v && typeof v === 'object' && 'in' in v) return (v as { in: unknown[] }).in.includes(row[k]);
  return row[k] === v;
});
const full = (s: Row): Row => ({
  ...s,
  misureBottoniere: misure.filter((m) => m.schedaId === s.id).sort((a, b) => Number(a.fermata) - Number(b.fermata)),
  createdBy: s.createdById ? { name: NAMES[String(s.createdById)] } : null,
  updatedBy: s.updatedById ? { name: NAMES[String(s.updatedById)] } : null,
  deletedBy: s.deletedById ? { name: NAMES[String(s.deletedById)] } : null,
  company: { id: s.companyId, name: s.companyId === 'c1' ? 'Ascensori Rossi Srl' : 'Altra Ditta' },
});
const db = {
  scheda: {
    create: async ({ data }: { data: Row & { misureBottoniere: { createMany: { data: Row[] } } } }) => {
      const { misureBottoniere, ...rest } = data;
      const at = tick();
      const row: Row = { id: `cm${String(++seq).padStart(22, '0')}`, deletedAt: null, deletedById: null, createdAt: at, updatedAt: at, ...rest };
      schede.push(row);
      for (const m of misureBottoniere.createMany.data) misure.push({ ...m, schedaId: row.id });
      return row;
    },
    findFirst: async ({ where }: { where: Row }) => { const s = schede.find((r) => matches(r, where)); return s ? full(s) : null; },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = schede.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data, { updatedAt: tick() });
      return { count: hit.length };
    },
    count: async ({ where }: { where: Row }) => schede.filter((r) => matches(r, where)).length,
    deleteMany: async ({ where }: { where: Row }) => {
      const hit = schede.filter((r) => matches(r, where));
      for (const r of hit) {
        schede.splice(schedeIndex(r), 1);
        for (let i = misure.length - 1; i >= 0; i--) if (misure[i]?.schedaId === r.id) misure.splice(i, 1);
      }
      return { count: hit.length };
    },
  },
  misuraBottoniera: {
    deleteMany: async ({ where }: { where: Row }) => {
      const before = misure.length;
      for (let i = misure.length - 1; i >= 0; i--) if (misure[i]?.schedaId === where.schedaId) misure.splice(i, 1);
      return { count: before - misure.length };
    },
    createMany: async ({ data }: { data: Row[] }) => { misure.push(...data); return { count: data.length }; },
  },
  auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return data; } },
  company: { findUnique: async () => ({ logo: null }) },
  $transaction: async (fn: unknown) => (typeof fn === 'function' ? fn(db) : Promise.all(fn as Promise<unknown>[])),
};
const schedeIndex = (r: Row) => schede.indexOf(r);

class Redirect extends Error { constructor(readonly url: string) { super(`redirect ${url}`); } }
let user: Record<string, unknown> | null = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(src('lib/env.ts'), { namedExports: { env: () => ({ REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' }), publicBaseUrl: () => 'http://x' } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (url: string) => { throw new Redirect(url); } } });

const as = (id: string, role: string, companyId = 'c1', readOnly = false) => {
  user = { id, email: `${id}@example.it`, name: NAMES[id] ?? id, role, locale: 'it', companyId, companyName: companyId === 'c1' ? 'Ascensori Rossi Srl' : 'Altra Ditta', mustChangePassword: false, readOnly };
};
const form = (fields: Record<string, string | string[]>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const redirected = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) { if (e instanceof Redirect) return e.url; throw e; }
  assert.fail('expected a redirect');
};

const SHEET = {
  data: '2026-10-12', indirizzo: 'Via Giuseppe Verdi 14, Milano', marca: 'Schindler', matricola: '0033871', numeroImpianto: '104552',
  portataKg: '630', capienzaPersone: '8', fermate: '3', tipoPorte: 'MANUALI', pattinoRetrattile: 'si', pattinoRetrattileNumero: '2',
  bottoniereMisure: 'si', 'mb-1-piano': 'S1', 'mb-1-lunghezzaMm': '320,5', 'mb-1-display': 'si', 'mb-2-piano': '2', 'mb-3-display': 'no',
  quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-_': '1', 'oq-ordine': 'si', 'oq-nFermate': '3',
  arganoMarca: 'MONTANARI', arganoPreventivo: 'no', 'pa-_': '1', 'pa-portata': '630',
};
const actions = () => import(src('server/rilievi/actions.ts'));
const pages = () => import(src('server/rilievi/pages.ts'));
const idOf = (url: string) => /\/rilievi\/([a-z0-9]+)/.exec(url)?.[1] ?? '';

async function created(): Promise<string> {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  return idOf(await redirected(createRilievoAction({ status: 'idle' }, form(SHEET))));
}

test('una scheda nuova: nella propria azienda, con l’autore, la catena, le misure e il modulo; una riga di registro senza contenuto', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const url = await redirected(createRilievoAction({ status: 'idle' }, form(SHEET)));
  assert.match(url, /^\/it\/app\/rilievi\/cm\d{22}\?ok=schedaCreated$/);
  const row = schede.find((s) => s.id === idOf(url));
  assert.ok(row);
  assert.equal(row.companyId, 'c1');
  assert.equal(row.createdById, 'u1');
  assert.equal(row.updatedById, 'u1');
  assert.equal(row.pattinoRetrattileNumero, 2, 'the conditional chain is kept: MANUALI → pattino sì → numero');
  assert.match(String(row.searchText), /^104552 0033871 via giuseppe verdi 14 milano schindler$/);
  assert.deepEqual(row.ordineQuadro, { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true, nFermate: '3' } });
  assert.equal(row.preventivoArgano, Prisma.DbNull, 'a module answered «No» is a real SQL NULL, never JSON null');
  assert.deepEqual(misure.filter((m) => m.schedaId === row.id).map((m) => [m.fermata, m.piano, m.lunghezzaMm, m.display]), [[1, 'S1', '320.50', true], [3, null, null, false]]);
  assert.deepEqual(audits.filter((a) => a.entityId === row.id), [{ companyId: 'c1', userId: 'u1', action: 'SCHEDA_CREATED', entity: 'Scheda', entityId: row.id, meta: undefined }]);
});

test('i dati sbagliati: tornano con gli errori e con quello che era scritto, niente salvato', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const before = schede.length;
  const r = await createRilievoAction({ status: 'idle' }, form({ data: '2026-10-12', portataKg: '63O' }));
  assert.equal(r.status, 'invalid');
  assert.ok(r.status === 'invalid' && r.errors.portataKg === 'integer' && r.errors.identifiers === 'identifierNeeded');
  assert.ok(r.status === 'invalid' && r.values.portataKg === '63O');
  assert.equal(schede.length, before);
});

test('chi scrive: ogni ruolo (anche il Commerciale); in sola lettura nessuno; troppi campi non sono un modulo', async () => {
  const { createRilievoAction } = await actions();
  as('u4', 'SALES');
  assert.match(await redirected(createRilievoAction({ status: 'idle' }, form(SHEET))), /ok=schedaCreated/);
  as('u3', 'OWNER', 'c1', true);
  assert.deepEqual(await createRilievoAction({ status: 'idle' }, form(SHEET)), { status: 'error', error: 'forbidden' });
  as('u3', 'OWNER');
  const many = form(SHEET);
  for (let i = 0; i < 2500; i++) many.append(`x${i}`, '');
  assert.deepEqual(await createRilievoAction({ status: 'idle' }, many), { status: 'error', error: 'tooLarge' });
});

test('la versione aperta: chi salva su una versione superata riceve il conflitto, i suoi dati restano, nulla è sovrascritto', async () => {
  const { updateRilievoAction } = await actions();
  const id = await created();
  const opened = (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  as('u3', 'OWNER');
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form({ ...SHEET, id, base: opened, marca: 'Otis' }))), new RegExp(`/rilievi/${id}\\?ok=schedaSaved$`));
  as('u2', 'ENGINEER');
  const r = await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, id, base: opened, marca: 'Kone' }));
  assert.equal(r.status, 'conflict');
  const current = schede.find((s) => s.id === id);
  assert.equal(current?.marca, 'Otis', 'the other person’s change is not overwritten');
  assert.ok(r.status === 'conflict' && r.values.marca === 'Kone', 'the input stays on the screen');
  assert.ok(r.status === 'conflict' && r.base === (current?.updatedAt as Date).toISOString(), 'the base is now the current version');
  assert.ok(r.status === 'conflict' && /^Ultima modifica di Anna Neri il \d\d\/\d\d\/\d{4}, \d\d:\d\d$/.test(r.updated), 'the head names the version that caused it');
  // saved again knowingly, over the version seen
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form({ ...SHEET, id, base: r.status === 'conflict' ? r.base : '', marca: 'Kone' }))), /ok=schedaSaved/);
  assert.equal(schede.find((s) => s.id === id)?.marca, 'Kone');
  assert.equal((await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, id, base: 'non-una-data' }))).status, 'conflict');
});

test('la scheda di un’altra azienda non esiste: modifica, cestino, pagina, PDF', async () => {
  const { updateRilievoAction, trashRilievoAction, restoreRilievoAction } = await actions();
  const { sheetToShow, sheetToEdit } = await pages();
  const id = await created();
  as('u9', 'OWNER', 'c2');
  assert.deepEqual(await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, id, base: new Date().toISOString() })), { status: 'error', error: 'notFound' });
  assert.deepEqual(await trashRilievoAction({}, form({ id })), { error: 'notFound' });
  assert.deepEqual(await restoreRilievoAction({}, form({ id })), { error: 'notFound' });
  assert.equal(await sheetToShow(user as never, id), null);
  assert.equal(await sheetToEdit(user as never, id), null);
  assert.equal(await sheetToShow(user as never, '../etc/passwd'), null);
  assert.equal(schede.find((s) => s.id === id)?.deletedAt, null);
});

test('il cestino: sposta il Progettista, gestisce il titolare; sequenza nel registro', async () => {
  const { trashRilievoAction, restoreRilievoAction, purgeRilievoAction } = await actions();
  const { sheetToShow, sheetToPurge } = await pages();
  const id = await created();
  as('u1', 'TECHNICIAN');
  assert.deepEqual(await trashRilievoAction({}, form({ id })), { error: 'forbidden' });
  as('u2', 'ENGINEER');
  assert.equal(await redirected(trashRilievoAction({}, form({ id }))), '/it/app/rilievi?ok=schedaTrashed');
  assert.equal(await sheetToShow(user as never, id), null, 'a trashed sheet is gone for whoever does not manage the trash');
  assert.deepEqual(await restoreRilievoAction({}, form({ id })), { error: 'forbidden' });
  as('u3', 'OWNER');
  assert.ok((await sheetToShow(user as never, id))?.deletedAt, 'the owner opens it from the trash');
  assert.equal(await redirected(restoreRilievoAction({}, form({ id }))), `/it/app/rilievi/${id}?ok=schedaRestored`);
  assert.equal(await sheetToPurge(user as never, id), null, 'not in the trash: nothing to delete for good');
  assert.deepEqual(await purgeRilievoAction({}, form({ id })), { error: 'notFound' });
  await redirected(trashRilievoAction({}, form({ id })));
  assert.equal(await redirected(purgeRilievoAction({}, form({ id }))), '/it/app/rilievi/cestino?ok=schedaPurged');
  assert.equal(schede.some((s) => s.id === id), false);
  assert.equal(misure.some((m) => m.schedaId === id), false, 'the measurements go with it');
  assert.deepEqual(audits.filter((a) => a.entityId === id).map((a) => a.action), ['SCHEDA_CREATED', 'SCHEDA_TRASHED', 'SCHEDA_RESTORED', 'SCHEDA_TRASHED', 'SCHEDA_PURGED']);
  assert.ok(audits.every((a) => a.meta === undefined), 'no content of the sheet in the log');
});

test('i PDF: la scheda e il modulo compilato, da scaricare o da stampare; altrimenti 404', async () => {
  const sheet = await import(src('app/api/rilievi/[id]/pdf/route.ts'));
  const modulo = await import(src('app/api/rilievi/[id]/[modulo]/route.ts'));
  const id = await created();
  const get = (r: { GET: (q: Request, c: unknown) => Promise<Response> }, q: string, params: Record<string, string>) => r.GET(new Request(`http://x/api${q}`), { params: Promise.resolve(params) });
  as('u4', 'SALES');
  let r = await get(sheet, '', { id });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/pdf');
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="scheda-104552-2026-10-12.pdf"');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await r.arrayBuffer()).byteLength > 5000, true);
  r = await get(sheet, '?inline=1', { id });
  assert.equal(r.headers.get('Content-Disposition'), 'inline; filename="scheda-104552-2026-10-12.pdf"');
  r = await get(modulo, '', { id, modulo: 'ordine-quadro' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="ordine-quadro-104552-2026-10-12.pdf"');
  assert.equal((await get(modulo, '', { id, modulo: 'preventivo-argano' })).status, 404, 'answered «No»: no module');
  assert.equal((await get(modulo, '', { id, modulo: 'altro' })).status, 404);
  as('u9', 'OWNER', 'c2');
  assert.equal((await get(sheet, '', { id })).status, 404);
  assert.equal((await get(modulo, '', { id, modulo: 'ordine-quadro' })).status, 404);
  user = null;
  assert.equal((await get(sheet, '', { id })).status, 401);
  assert.equal((await get(modulo, '', { id, modulo: 'altro' })).status, 404, 'an unknown module path: 404 before the sign-in and the download quota');
});
