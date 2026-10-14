// Rilievi — the linked data between the sheet and the suppliers' modules, MoviLift and the company's order of the sheet's
// sections, end to end over the in-memory database (rilievi-actions-fixture.ts), as rilievi's integration tests
// (collegati, movilift, tempo-reale, impostazioni; commit ae6329cb6): the discrepancies confirmed before the save and
// remembered after it, a forged answer that breaks nothing, the modules in the print only when the sheet asks, the
// MoviLift order and its PDF by the make, the order of the sections only for whoever holds 'company:edit'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsOf } from '@/lib/rbac';
import { actions, as, audits, companies, form, idOf, pages, redirected, schede, session, src } from './rilievi-actions-fixture';

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
  const edit = (changes: Record<string, string>) => updateRilievoAction({ status: 'idle' }, form({ ...sent, ...changes, scheda: id, base: base() }));
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
  await redirected(updateRilievoAction({ status: 'idle' }, form({ ...sheet, quadroMarca: 'PELAZZA', 'oq-nFermate': '5', scheda: id, base })));
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
  // a refusal does nothing and keeps the order on screen: the one sent with the press
  const kept = (error: string, list: readonly string[], modificato: boolean) => ({ status: 'error', error, ordine: [...list], modificato });
  as('u1', 'TECHNICIAN');
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { salva: '1' })), kept('forbidden', ORDINABILI, false));
  // the round-42 matrix: 'company:edit' is the owner's, and the Capotecnico's only when the company gives it
  as('u2', 'CHIEF_TECHNICIAN');
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { sposta: 'note:su' })), kept('forbidden', ORDINABILI, false));
  as('u2', 'CHIEF_TECHNICIAN', 'c1', false, capsOf('CHIEF_TECHNICIAN', [{ role: 'CHIEF_TECHNICIAN', capability: 'company:edit', granted: true }]));
  assert.equal((await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { sposta: 'note:su' }))).status, 'moved');
  as('u3', 'OWNER', 'c1', true);
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { salva: '1' })), kept('readOnly', ORDINABILI, false), 'read only: said so');
  // moves not saved yet stay on screen, still unsaved — also after the reset form, which sends no order (the one shown before)
  const onScreen = [...ORDINABILI.slice(0, -2), 'note', 'allarme'];
  const shown = { status: 'moved', ordine: onScreen, focus: { key: 'note', verso: 'su' } };
  assert.deepEqual(await ordineSezioniAction(shown, ordine(onScreen, { salva: '1' })), kept('readOnly', onScreen, true), 'read only: the moves stay');
  assert.deepEqual(await ordineSezioniAction(shown, form({ ripristina: '1' })), kept('readOnly', onScreen, true), 'read only: the reset refused, the moves stay');
  assert.deepEqual(companies.c1?.ordineSezioni, [], 'nothing saved');
  as('u3', 'OWNER');
  const moved = await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { sposta: 'note:su' }));
  assert.equal(moved.status, 'moved');
  assert.deepEqual(moved.status === 'moved' && moved.ordine.slice(-2), ['note', 'allarme']);
  assert.deepEqual(companies.c1?.ordineSezioni, [], 'a move alone saves nothing');
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(ORDINABILI, { sposta: 'note:su:x' })), moved, 'as rilievi: what follows a further «:» is ignored');
  const custom = moved.status === 'moved' ? moved.ordine : [];
  const auditsBefore = audits.length;
  assert.deepEqual(await ordineSezioniAction({ status: 'idle' }, ordine(custom, { salva: '1' })), { status: 'saved', ordine: custom });
  assert.deepEqual(companies.c1?.ordineSezioni, custom);
  assert.deepEqual(audits.slice(auditsBefore), [{ companyId: 'c1', userId: 'u3', action: 'COMPANY_SECTIONS_UPDATED', entity: 'Company', entityId: 'c1', meta: { predefinito: false } }]);
  assert.deepEqual((await formSections(session())).slice(0, 1), ['impianto']);
  assert.deepEqual((await formSections(session())).slice(-2), ['note', 'allarme'], 'the form of a new sheet in the company order');
  const forged = await ordineSezioniAction({ status: 'idle' }, ordine(['impianto', ...ORDINABILI.slice(1)], { salva: '1' }));
  assert.deepEqual(forged, { status: 'invalid', ordine: custom }, 'a forged order: the saved one back');
  assert.equal((await ordineSezioniAction({ status: 'idle' }, form({ ripristina: '1' }))).status, 'reset');
  assert.deepEqual(companies.c1?.ordineSezioni, []);
  assert.deepEqual(companies.c2?.ordineSezioni, [], 'another company is never touched');
});
