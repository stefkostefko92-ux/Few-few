// The write key of the survey sheet's form (round 48, review code1): a save whose answer was lost on the way back (no
// signal in the shaft, keep-on-failure.ts) and is sent again with the same key makes no second sheet and does not read
// as somebody else's change; two attempts arriving together are one sheet (the unique index, P2002); a key is the
// company's own, and a forged one is no key. Over the in-memory database of rilievi-actions-fixture.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actions, as, audits, form, idOf, redirected, schede, SHEET } from './rilievi-actions-fixture';

const KEY = '3f2b8c1e-5d4a-4b6f-9e21-7c0d8a9b1e42', OTHER = '9a1c2e3f-4b5d-4e6f-8a7b-0c1d2e3f4a5b';
const count = (matricola: string) => schede.filter((s) => s.matricola === matricola).length;

test('lo stesso salvataggio inviato di nuovo: nessuna seconda scheda, la risposta è la scheda già fatta', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const sheet = { ...SHEET, matricola: '5550001', writeKey: KEY };
  const first = await redirected(createRilievoAction({ status: 'idle' }, form(sheet)));
  // the answer was lost: the same form sends it again, also with the data changed meanwhile — the save already made wins
  const again = await redirected(createRilievoAction({ status: 'idle' }, form({ ...sheet, marca: 'Kone' })));
  assert.equal(again, first, 'the same sheet, the same notice');
  assert.equal(count('5550001'), 1, 'one sheet');
  assert.equal(schede.find((s) => s.id === idOf(first))?.writeKey, KEY, 'the key is stored with the sheet');
  assert.equal(audits.filter((a) => a.entityId === idOf(first) && a.action === 'SCHEDA_CREATED').length, 1, 'one audit row');
  // a new form (a new key) is a new sheet; no key at all (the form before hydration) always is
  await redirected(createRilievoAction({ status: 'idle' }, form({ ...sheet, writeKey: OTHER })));
  await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550001' })));
  await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550001' })));
  assert.equal(count('5550001'), 4);
});

test('due invii insieme con la stessa chiave: una scheda sola (l’indice unico, P2002), tutti e due rimandano a quella', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const key = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const sheet = form({ ...SHEET, matricola: '5550002', writeKey: key });
  const [a, b] = await Promise.all([redirected(createRilievoAction({ status: 'idle' }, sheet)), redirected(createRilievoAction({ status: 'idle' }, sheet))]);
  assert.equal(a, b);
  assert.equal(count('5550002'), 1);
});

test('la chiave è dell’azienda; una chiave che il browser non fa non è una chiave', async () => {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const key = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  const ours = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550003', writeKey: key }))));
  as('u9', 'OWNER', 'c2');
  const theirs = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550003', writeKey: key }))));
  assert.notEqual(theirs, ours, 'another company never reaches our sheet through a key');
  assert.equal(schede.find((s) => s.id === theirs)?.companyId, 'c2');
  as('u1', 'TECHNICIAN');
  const forged = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550004', writeKey: `${key}' or 1=1` }))));
  assert.equal(schede.find((s) => s.id === forged)?.writeKey, null, 'not a UUID: stored as no key');
});

test('la modifica inviata di nuovo dopo una risposta persa: salvata, non un conflitto; il cambio di un altro resta un conflitto', async () => {
  const { createRilievoAction, updateRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const id = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550005' }))));
  const opened = (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  const edit = { ...SHEET, matricola: '5550005', scheda: id, base: opened, marca: 'Otis', writeKey: '7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918' };
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form(edit))), new RegExp(`/rilievi/${id}\\?ok=schedaSaved$`));
  const saved = schede.find((s) => s.id === id)?.updatedAt;
  // the same attempt again, over the version it was opened on: it was this save — saved, nothing written twice
  assert.match(await redirected(updateRilievoAction({ status: 'idle' }, form(edit))), new RegExp(`/rilievi/${id}\\?ok=schedaSaved$`));
  assert.equal(schede.find((s) => s.id === id)?.updatedAt, saved, 'nothing written again');
  assert.equal(audits.filter((a) => a.entityId === id && a.action === 'SCHEDA_UPDATED').length, 1);
  // somebody else saves meanwhile (another form, another key): the old attempt is a conflict again
  as('u3', 'OWNER');
  const current = (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  await redirected(updateRilievoAction({ status: 'idle' }, form({ ...edit, base: current, marca: 'Kone', writeKey: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f' })));
  as('u1', 'TECHNICIAN');
  const r = await updateRilievoAction({ status: 'idle' }, form(edit));
  assert.equal(r.status, 'conflict');
  assert.equal(schede.find((s) => s.id === id)?.marca, 'Kone', 'nothing overwritten');
  // without a key (the form before hydration) a stale version stays a conflict too
  assert.equal((await updateRilievoAction({ status: 'idle' }, form({ ...edit, writeKey: '' }))).status, 'conflict');
});

test('una chiave già di un’altra scheda dell’azienda (solo falsificata: ogni modulo ha la sua) non scrive nulla', async () => {
  const { createRilievoAction, updateRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  const key = '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a';
  await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550006', writeKey: key })));
  const id = idOf(await redirected(createRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550007' }))));
  const base = (schede.find((s) => s.id === id)?.updatedAt as Date).toISOString();
  const r = await updateRilievoAction({ status: 'idle' }, form({ ...SHEET, matricola: '5550007', scheda: id, base, marca: 'Otis', writeKey: key }));
  assert.equal(r.status, 'conflict', 'the unique index refuses it: nothing written, the form says so');
  assert.equal(schede.find((s) => s.id === id)?.marca, 'Schindler');
});
