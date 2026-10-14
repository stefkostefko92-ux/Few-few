// Rilievi — the server side of the survey sheets end to end over an in-memory database, as rilievi's integration tests
// (schede, campi, ordini, aziende, collegati, movilift, tempo-reale, impostazioni; commit ae6329cb6) for what does not
// need PostgreSQL: a sheet saved within the company with its author, conditional chain, measurements and supplier
// module, one audit row without content; the errors keep the input; the version guard (409: the input stays, nothing
// overwritten, the next save knowingly wins); the discrepancies between the sheet and the modules confirmed before the
// save, remembered after it; MoviLift and the make; another company's sheet is "not found" everywhere; the trash by the
// rights of each role; the PDFs' answers; the company's order of the sections.
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
  company: { id: s.companyId, name: s.companyId === 'c1' ? 'Ascensori Rossi Srl' : 'Altra Ditta', ordineSezioni: companies[String(s.companyId)]?.ordineSezioni ?? [] },
});
const companies: Record<string, { ordineSezioni: string[] }> = { c1: { ordineSezioni: [] }, c2: { ordineSezioni: [] } };
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
  company: {
    findUnique: async ({ where }: { where: { id: string } }) => ({ logo: null, ordineSezioni: companies[where.id]?.ordineSezioni ?? [] }),
    updateMany: async ({ where, data }: { where: { id: string }; data: { ordineSezioni: string[] } }) => {
      const row = companies[where.id];
      if (!row) return { count: 0 };
      row.ordineSezioni = data.ordineSezioni;
      return { count: 1 };
    },
  },
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
  portataKg: '630', capienzaPersone: '8', fermate: '3', tipoPorte: 'MANUALI', pattinoRetrattile: 'si', pattinoRetrattileNumero: '2', sospensioni: 'si', sospensioniNumero: '5',
  bottoniereMisure: 'si', 'mb-1-piano': 'S1', 'mb-1-lunghezzaMm': '320,5', 'mb-1-display': 'si', 'mb-2-piano': '2', 'mb-3-display': 'no',
  quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-_': '1', 'oq-ordine': 'si', 'oq-nFermate': '3',
  arganoMarca: 'MONTANARI', arganoPreventivo: 'no', 'pa-_': '1', 'pa-portata': '630', 'sg-_': '1', 'sg-ordNo': '77',
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
  assert.equal(row.pattinoRetrattile, true, 'the conditional chain is kept: MANUALI → pattino sì');
  for (const key of ['pattinoRetrattileNumero', 'arganoMarca']) assert.ok(!(key in row), `${key}: taken off the sheet, never written`);
  assert.equal(row.sospensioniNumero, 5);
  assert.deepEqual(row.ordineSospensioni, { modulo: '2sg-ordine-porte', valori: { ordNo: '77' } });
  assert.equal(row.riepilogoOrdini, false);
  assert.equal(row.discrepanzeConfermate, null, 'nothing to confirm');
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
  assert.equal((await get(modulo, '', { id, modulo: 'dati-argano' })).status, 404, 'answered «No»: no module');
  assert.equal((await get(modulo, '', { id, modulo: 'preventivo-argano' })).status, 404, 'the Montanari request is gone');
  assert.equal((await get(modulo, '', { id, modulo: 'ordine-quadro-movilift' })).status, 404, 'a Pelazza panel: no MoviLift order');
  r = await get(modulo, '', { id, modulo: 'sospensioni-2sg' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="sospensioni-2sg-104552-2026-10-12.pdf"');
  assert.equal((await get(modulo, '', { id, modulo: 'altro' })).status, 404);
  as('u9', 'OWNER', 'c2');
  assert.equal((await get(sheet, '', { id })).status, 404);
  assert.equal((await get(modulo, '', { id, modulo: 'ordine-quadro' })).status, 404);
  user = null;
  assert.equal((await get(sheet, '', { id })).status, 401);
  assert.equal((await get(modulo, '', { id, modulo: 'altro' })).status, 404, 'an unknown module path: 404 before the sign-in and the download quota');
});

/** The panel order and the argano sheet open, with speed and travel, as the browser sends them (rilievi's collegati). */
const SURVEY = { data: '2026-10-12', numeroImpianto: '880022', indirizzo: 'Via Po 3, Torino', fermate: '5', portataKg: '480' };
const ORDERS = {
  quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-_': '1', 'oq-ordine': 'si', 'oq-nFermate': '5', 'oq-velocita': '1,0', 'oq-corsa': '12', 'oq-note': 'Consegna in cantiere',
  arganoPreventivo: 'si', 'pa-_': '1', 'pa-piani': '5', 'pa-portata': '480', 'pa-velocita': '1,0', 'pa-motoreInverter': 'si',
};

test('i dati diversi tra scheda e ordini: chiesti prima di salvare, salvati una volta confermati, chiesti di nuovo se cambiano', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const before = schede.length;
  const sent = { ...SURVEY, ...ORDERS, 'oq-nFermate': '6', 'pa-velocita': '1,6' };
  const asked = await createRilievoAction({ status: 'idle' }, form(sent));
  assert.equal(asked.status, 'confirm');
  assert.equal(schede.length, before, 'nothing saved yet');
  assert.ok(asked.status === 'confirm');
  assert.deepEqual(asked.discrepanze, [
    { key: 'fermate', voci: [{ luogo: 'scheda', valore: '5' }, { luogo: 'oq', valore: '6' }, { luogo: 'pa', valore: '5' }] },
    { key: 'velocita', voci: [{ luogo: 'oq', valore: '1,0' }, { luogo: 'pa', valore: '1,6' }] },
  ]);
  assert.match(asked.impronta, /^[0-9a-f]{32}$/);
  assert.equal(asked.values['oq-nFermate'], '6', 'what was typed stays on screen');
  // Enter in a field sends the first button, «Salva»: asked again, never confirmed
  assert.equal((await createRilievoAction({ status: 'idle' }, form(sent))).status, 'confirm');
  // the differences changed since: asked again with another fingerprint
  const changed = await createRilievoAction({ status: 'idle' }, form({ ...sent, 'oq-nFermate': '7', conferma: asked.impronta }));
  assert.ok(changed.status === 'confirm' && changed.impronta !== asked.impronta);
  // «Salva comunque»: saved, the fingerprint remembered with the sheet
  const url = await redirected(createRilievoAction({ status: 'idle' }, form({ ...sent, conferma: asked.impronta })));
  const row = schede.find((s) => s.id === idOf(url));
  assert.equal((row?.ordineQuadro as { valori: Record<string, string> }).valori.nFermate, '6');
  assert.equal(row?.discrepanzeConfermate, asked.impronta);
  const { sheetView } = await pages();
  const shown = await import(src('server/rilievi/queries.ts'));
  const full = await shown.getScheda('c1', idOf(url));
  assert.deepEqual(sheetView(full).discrepanze.map((d: { key: string }) => d.key), ['fermate', 'velocita'], 'saved with the confirmation: shown on the page');
});

test('quello che è stato confermato si ricorda: le stesse differenze non si chiedono più, le nuove sì', async () => {
  const { createRilievoAction, updateRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const sent = { ...SURVEY, ...ORDERS, 'pa-velocita': '1,6' };
  const asked = await createRilievoAction({ status: 'idle' }, form(sent));
  assert.ok(asked.status === 'confirm');
  const id = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...sent, conferma: asked.impronta }))));
  const base = () => (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  const edit = (changes: Record<string, string>) => updateRilievoAction({ status: 'idle' }, form({ ...sent, ...changes, id, base: base() }));
  // another field changes, the confirmed difference stays: saved without asking
  assert.match(await redirected(edit({ 'oq-note': 'Nota nuova' })), /ok=schedaSaved/);
  // the difference itself changes: asked again
  const again = await edit({ 'pa-velocita': '1,8' });
  assert.ok(again.status === 'confirm' && again.discrepanze[0]?.voci[1]?.valore === '1,8');
  assert.equal(again.status === 'confirm' && again.base, base(), 'the version the form was opened on stays');
  // once they agree, nothing is left to confirm
  assert.match(await redirected(edit({ 'pa-velocita': '1,0' })), /ok=schedaSaved/);
  assert.equal(schede.find((s) => s.id === id)?.discrepanzeConfermate, null);
});

test('una risposta falsificata non rompe nulla; la scelta della stampa falsificata è nominata; chi segue resta tale', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  for (const forged of ['constructor', '__proto__', 'toString']) {
    const r = await createRilievoAction({ status: 'idle' }, form({ ...SURVEY, ...ORDERS, tipoPorte: 'AUTOMATICHE', doppioAccesso: forged, 'oq-nAccessi': '2', 'om-ingressi': forged }));
    assert.equal(r.status, 'invalid', forged);
    assert.ok(r.status === 'invalid' && r.errors.doppioAccesso === 'option', forged);
  }
  const print = await createRilievoAction({ status: 'idle' }, form({ ...SURVEY, riepilogoOrdini: 'yes' }));
  assert.ok(print.status === 'invalid' && print.errors.riepilogoOrdini === 'invalid');
  // no identifier: back with an error; the linked fields still following stay so, a field that never follows does not
  const back = await createRilievoAction({ status: 'idle' }, form({ ...ORDERS, data: '2026-10-12', fermate: '5', 'collegati-auto': 'oq-nFermate oq-note fermate' }));
  assert.ok(back.status === 'invalid');
  assert.deepEqual([...back.auto].filter((n) => ['oq-nFermate', 'oq-note', 'fermate'].includes(n)).sort(), ['fermate', 'oq-nFermate']);
});

test('la stampa con i moduli: solo se la scheda lo chiede', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const id = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SURVEY, ...ORDERS, riepilogoOrdini: '1' }))));
  assert.equal(schede.find((s) => s.id === id)?.riepilogoOrdini, true);
  const { printView } = await pages();
  const { getScheda } = await import(src('server/rilievi/queries.ts'));
  const view = printView(await getScheda('c1', id));
  assert.deepEqual(view.riepilogo.map((m: { nome: string }) => m.nome), ['Modulo d\'ordine quadri · Pelazza Peppino', 'Modulo rilievi dati argani']);
  assert.ok(!view.printed.some((s: { key: string }) => s.key === 'impianto'), '«Impianto» is in the head and the plate');
});

test('l’ordine quadro MoviLift: salvato con la scheda, il suo PDF; con Pelazza al cambio della marca', async () => {
  const { createRilievoAction, updateRilievoAction } = await actions();
  const modulo = await import(src('app/api/rilievi/[id]/[modulo]/route.ts'));
  const get = (id: string, path: string) => modulo.GET(new Request('http://x/api'), { params: Promise.resolve({ id, modulo: path }) });
  as('u1', 'TECHNICIAN');
  const MOVILIFT = {
    quadroMarca: 'MOVILIFT', quadroOrdine: 'si', 'oq-_': '1', 'oq-nFermate': '9', 'om-_': '1', 'om-fermate': '5', 'om-controllo': 'plc', 'om-portata': '480', 'om-ingressi': 'doppio',
    'om-marcaOpA': 'SELCOM', 'om-voltA': '24Vcc', 'om-pianoA1': 'T', 'om-locMacc': 'basso', 'om-note': 'Consegna in cantiere',
  };
  const sheet = { ...SURVEY, data: '2026-10-13', numeroImpianto: '880033', tipoPorte: 'AUTOMATICHE', doppioAccesso: 'si', ubicazioneMacchina: 'BASSO', ...MOVILIFT };
  const id = idOf(await redirected(createRilievoAction({ status: 'idle' }, form(sheet))));
  assert.deepEqual(schede.find((s) => s.id === id)?.ordineQuadro, {
    modulo: 'movilift-modulo-ordine-scelta-v2-6',
    valori: { fermate: '5', controllo: 'plc', portata: '480', ingressi: 'doppio', marcaOpA: 'SELCOM', voltA: '24Vcc', pianoA1: 'T', locMacc: 'basso', note: 'Consegna in cantiere' },
  });
  let r = await get(id, 'ordine-quadro-movilift');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="ordine-quadro-movilift-880033-2026-10-13.pdf"');
  assert.equal((await get(id, 'ordine-quadro')).status, 404);
  // what disagrees with the sheet is asked; what is left of the Pelazza form is never read
  const asked = await createRilievoAction({ status: 'idle' }, form({ ...sheet, 'om-fermate': '6', 'om-ingressi': 'unico' }));
  assert.ok(asked.status === 'confirm');
  assert.deepEqual(asked.discrepanze, [
    { key: 'fermate', voci: [{ luogo: 'scheda', valore: '5' }, { luogo: 'om', valore: '6' }] },
    { key: 'ingressi', voci: [{ luogo: 'scheda', valore: '2' }, { luogo: 'om', valore: 'Operatore Unico' }] },
  ]);
  // a forged option is refused and named
  const forged = await createRilievoAction({ status: 'idle' }, form({ ...sheet, 'om-voltA': '380V', 'om-controllo': 'constructor' }));
  assert.ok(forged.status === 'invalid' && forged.errors['om-voltA'] === 'option' && forged.errors['om-controllo'] === 'option');
  // the panel turns out to be a Pelazza
  const base = (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  await redirected(updateRilievoAction({ status: 'idle' }, form({ ...sheet, quadroMarca: 'PELAZZA', 'oq-nFermate': '5', id, base })));
  assert.deepEqual(schede.find((s) => s.id === id)?.ordineQuadro, { modulo: 'pelazza-ordine-quadri-032026', valori: { nFermate: '5' } });
  assert.equal((await get(id, 'ordine-quadro-movilift')).status, 404);
  r = await get(id, 'ordine-quadro');
  assert.equal(r.status, 200);
});

test('l’ordine delle sezioni: solo chi modifica l’azienda; sposta senza salvare, salva con il registro, ripristina', async () => {
  const { ordineSezioniAction } = await import(src('server/rilievi/sezioni-actions.ts'));
  const { ORDINABILI } = await import(src('lib/rilievi/ordine.ts'));
  const { formSections } = await pages();
  const ordine = (list: readonly string[], extra: Record<string, string> = {}) => form({ ordine: [...list], ...extra });
  as('u1', 'TECHNICIAN');
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { salva: '1' })), { status: 'error', error: 'forbidden' });
  as('u3', 'OWNER', 'c1', true);
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { salva: '1' })), { status: 'error', error: 'forbidden' }, 'read only');
  as('u3', 'OWNER');
  const moved = await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { sposta: 'note:su' }));
  assert.equal(moved.status, 'moved');
  assert.deepEqual(moved.status === 'moved' && moved.ordine.slice(-2), ['note', 'allarme']);
  assert.deepEqual(companies.c1?.ordineSezioni, [], 'a move alone saves nothing');
  const custom = moved.status === 'moved' ? moved.ordine : [];
  const auditsBefore = audits.length;
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(custom, { salva: '1' })), { status: 'saved', ordine: custom });
  assert.deepEqual(companies.c1?.ordineSezioni, custom);
  assert.deepEqual(audits.slice(auditsBefore), [{ companyId: 'c1', userId: 'u3', action: 'COMPANY_SECTIONS_UPDATED', entity: 'Company', entityId: 'c1', meta: { predefinito: false } }]);
  assert.deepEqual((await formSections(user as never)).slice(0, 1), ['impianto']);
  assert.deepEqual((await formSections(user as never)).slice(-2), ['note', 'allarme'], 'the form of a new sheet in the company order');
  const forged = await ordineSezioniAction({ status: 'idle' }, ordine(['impianto', ...ORDINABILI.slice(1)], { salva: '1' }));
  assert.deepEqual(forged, { status: 'invalid', ordine: custom }, 'a forged order: the saved one back');
  assert.equal((await ordineSezioniAction({ status: 'idle' }, form({ ripristina: '1' }))).status, 'reset');
  assert.deepEqual(companies.c1?.ordineSezioni, []);
  assert.deepEqual(companies.c2?.ordineSezioni, [], 'another company is never touched');
});
