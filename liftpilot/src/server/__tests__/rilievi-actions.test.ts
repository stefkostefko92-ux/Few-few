// Rilievi — the server side of the survey sheets end to end over an in-memory database (rilievi-actions-fixture.ts), as
// rilievi's integration tests (schede, campi, ordini, aziende; commit ae6329cb6) for what does not need PostgreSQL: a
// sheet saved within the company with its author, conditional chain, measurements and supplier modules, one audit row
// without content; the errors keep the input; who writes by the rights matrix and the read-only mode; the version guard
// (409: the input stays, nothing overwritten, the next save knowingly wins); another company's sheet is "not found"
// everywhere; the trash by the rights of each role; the PDFs' answers. The linked data, MoviLift and the company's order
// of the sections: rilievi-collegati-actions.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { actions, as, audits, created, form, idOf, misure, pages, redirected, schede, session, signOut, SHEET, src } from './rilievi-actions-fixture';

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

test('chi scrive: ogni ruolo tranne il Commerciale (matrice del 2026-10-14); in sola lettura nessuno, e gli si dice perché; troppi campi non sono un modulo', async () => {
  const { createRilievoAction } = await actions();
  as('u4', 'SALES');
  assert.deepEqual(await createRilievoAction({ status: 'idle' }, form(SHEET)), { status: 'error', error: 'forbidden' });
  as('u1', 'TECHNICIAN');
  assert.match(await redirected(createRilievoAction({ status: 'idle' }, form(SHEET))), /ok=schedaCreated/);
  // read-only (no subscription, terms not accepted): the role has the right, the company cannot write — said so
  as('u3', 'OWNER', 'c1', true);
  assert.deepEqual(await createRilievoAction({ status: 'idle' }, form(SHEET)), { status: 'error', error: 'readOnly' });
  as('u4', 'SALES', 'c1', true);
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
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: opened, marca: 'Otis' }))), new RegExp(`/rilievi/${id}\\?ok=schedaSaved$`));
  as('u2', 'ENGINEER');
  const r = await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: opened, marca: 'Kone' }));
  assert.equal(r.status, 'conflict');
  const current = schede.find((s) => s.id === id);
  assert.equal(current?.marca, 'Otis', 'the other person’s change is not overwritten');
  assert.ok(r.status === 'conflict' && r.values.marca === 'Kone', 'the input stays on the screen');
  assert.ok(r.status === 'conflict' && r.base === (current?.updatedAt as Date).toISOString(), 'the base is now the current version');
  assert.ok(r.status === 'conflict' && /^Ultima modifica di Anna Neri il \d\d\/\d\d\/\d{4}, \d\d:\d\d$/.test(r.updated), 'the head names the version that caused it');
  // saved again knowingly, over the version seen
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: r.status === 'conflict' ? r.base : '', marca: 'Kone' }))), /ok=schedaSaved/);
  assert.equal(schede.find((s) => s.id === id)?.marca, 'Kone');
  assert.equal((await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: 'non-una-data' }))).status, 'conflict');
});

test('la scheda di un’altra azienda non esiste: modifica, cestino, pagina, PDF', async () => {
  const { updateRilievoAction, trashRilievoAction, restoreRilievoAction } = await actions();
  const { sheetToShow, sheetToEdit } = await pages();
  const id = await created();
  as('u9', 'OWNER', 'c2');
  assert.deepEqual(await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: new Date().toISOString() })), { status: 'error', error: 'notFound' });
  assert.deepEqual(await trashRilievoAction({}, form({ id })), { error: 'notFound' });
  assert.deepEqual(await restoreRilievoAction({}, form({ id })), { error: 'notFound' });
  assert.equal(await sheetToShow(session(), id), null);
  assert.equal(await sheetToEdit(session(), id), null);
  assert.equal(await sheetToShow(session(), '../etc/passwd'), null);
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
  assert.equal(await sheetToShow(session(), id), null, 'a trashed sheet is gone for whoever does not manage the trash');
  assert.deepEqual(await restoreRilievoAction({}, form({ id })), { error: 'forbidden' });
  as('u3', 'OWNER');
  assert.ok((await sheetToShow(session(), id))?.deletedAt, 'the owner opens it from the trash');
  assert.equal(await redirected(restoreRilievoAction({}, form({ id }))), `/it/app/rilievi/${id}?ok=schedaRestored`);
  assert.equal(await sheetToPurge(session(), id), null, 'not in the trash: nothing to delete for good');
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
  signOut();
  assert.equal((await get(sheet, '', { id })).status, 401);
  assert.equal((await get(modulo, '', { id, modulo: 'altro' })).status, 404, 'an unknown module path: 404 before the sign-in and the download quota');
});

test('la sessione scaduta mentre si compila: la scheda risponde «sessionExpired» (i dati restano nel modulo), i pulsanti vanno al login', async () => {
  const { createRilievoAction, updateRilievoAction, trashRilievoAction } = await actions();
  const { ordineSezioniAction } = await import(src('server/rilievi/sezioni-actions.ts'));
  const id = await created();
  const before = schede.length, audited = audits.length;
  signOut();
  assert.deepEqual(await createRilievoAction({ status: 'idle' }, form(SHEET)), { status: 'error', error: 'sessionExpired' });
  assert.deepEqual(await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, scheda: id, base: '' })), { status: 'error', error: 'sessionExpired' });
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, form({ ordine: ['note'], salva: '1' })), { status: 'error', error: 'sessionExpired' },
    'an order that cannot be read is not kept; nothing done');
  assert.equal(schede.length, before, 'nothing written');
  assert.equal(audits.length, audited);
  // a button carries nothing typed: the sign-in page, as before
  assert.equal(await redirected(trashRilievoAction({}, form({ id, locale: 'it' }))), '/it/login');
  // signed in again (another tab): the same «Salva» goes through
  as('u1', 'TECHNICIAN');
  assert.match(await redirected(createRilievoAction({ status: 'idle' }, form(SHEET))), /ok=schedaCreated/);
});
