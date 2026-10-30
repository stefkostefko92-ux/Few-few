// Round 57: what the installation's reference survey gives the relazione tecnica after the owner's model — the empty
// «prima» (the roping, where the machine stands, the controller's regulation where it is asked) and the make — and
// never over what the RT holds (src/lib/rt2/rilievo.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conRilievo, type RilievoHints } from '@/lib/rt2/rilievo';

const H: RilievoHints = { persone: 8, fermate: 5, matricola: '0123456', marca: 'OTIS', taglia: 2, locale: 'basso', regolazione: '2v', data: '2026-10-10' };

test('rt2: il rilievo riempie i «prima» vuoti e la marca, mai ciò che la relazione ha', () => {
  const vuoto = conRilievo({}, H, true);
  assert.deepEqual(vuoto.inputs.tecnici?.prima, { r: 2, locale: 'basso', azionamento: '2v' });
  assert.equal(vuoto.inputs.doc?.costruttore, 'OTIS');
  assert.deepEqual(vuoto.dati, ['tecnici.prima.r', 'tecnici.prima.locale', 'tecnici.prima.azionamento', 'doc.costruttore']);
  // the regulation only where it is asked (the calculation's test has none)
  assert.equal(conRilievo({}, H, false).inputs.tecnici?.prima?.azionamento, undefined);
  // what the RT holds stays
  const scritto = conRilievo({ tecnici: { prima: { r: 1 } }, doc: { costruttore: 'Schindler' } }, H, true);
  assert.equal(scritto.inputs.tecnici?.prima?.r, 1);
  assert.equal(scritto.inputs.doc?.costruttore, 'Schindler');
  assert.ok(!scritto.dati.includes('tecnici.prima.r') && !scritto.dati.includes('doc.costruttore'));
  // no survey: as it is
  const I = { doc: { commessa: 'C-1' } };
  assert.equal(conRilievo(I, null, true).inputs, I);
});
