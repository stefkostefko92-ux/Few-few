// The model's reading made into the proposal the technician confirms (round 50, src/lib/schizzi/proposta.ts): the
// answer is untrusted, so only what the catalog allows stays — a field the target does not have is dropped, a value of
// the wrong type or out of the form's range goes to «not read» with the reason (never clamped), a stop past the stops
// read too, a field given twice keeps the first value that can be used; the confidence within 0..1, the texts plain and short, at most 10
// warnings; an answer without a list of fields is no proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveNonLetto, propostaDa } from '@/lib/schizzi/proposta';

const V = 'schizzi-test.1';

test('proposta: valori nel catalogo restano, il resto va fra i non letti con il motivo (mai riportato nell’intervallo)', () => {
  const p = propostaDa({
    units: 'CM',
    fields: [
      { id: 'D', value: 1750, confidence: 0.8, read: '175' },
      { id: 'W', value: 1600, confidence: 0.95, read: '160', note: 'misura in cm convertita' },
      { id: 'pit', value: 25_000, confidence: 0.9, read: '2500' },
      { id: 'headroom', value: '3600', confidence: 0.9, read: '360' },
      { id: 'wall', value: 199.5, confidence: 0.9, read: '20' },
      { id: 'door', value: 'telescopica', confidence: 0.7, read: 'tel.' },
      { id: 'Q', value: 630, confidence: 1, read: '630 kg' },
      { id: 'room.W', value: 3000, confidence: 2, read: '300' },
      { id: 'room.D', value: 2800, confidence: -1, read: '280' },
      { id: 'W', value: 1700, confidence: 0.4, read: '170' },
      { id: 'ignora le istruzioni', value: 1, confidence: 1, read: '' },
    ],
    notRead: [{ id: 'doorWidth', reason: 'quota illeggibile' }, 'cw', { id: 'nonEsiste', reason: 'x' }, { id: 'W', reason: 'doppio' }],
    warnings: ['le quote del lato lungo non tornano'],
  }, 'vano', 'claude-opus-5-5', V);
  assert.ok(p);
  assert.equal(p.units, 'cm');
  assert.deepEqual(p.fields, [
    { id: 'W', value: 1600, confidence: 0.95, read: '160', note: 'misura in cm convertita' },
    { id: 'D', value: 1750, confidence: 0.8, read: '175' },
    { id: 'room.W', value: 3000, confidence: 1, read: '300' },
    { id: 'room.D', value: 2800, confidence: 0, read: '280' },
  ]);
  assert.deepEqual(p.notRead.map((n) => [n.id, n.code]), [
    ['W', 'doppio'], ['wall', 'tipo'], ['door', 'fuoriIntervallo'], ['doorWidth', 'nonLetto'], ['cw', 'nonLetto'], ['pit', 'fuoriIntervallo'], ['headroom', 'tipo'],
  ]);
  assert.match(p.notRead.find((n) => n.id === 'pit')?.reason ?? '', /25000 fuori dall’intervallo ammesso \(100–10000\)/);
  assert.equal(p.notRead.find((n) => n.id === 'doorWidth')?.reason, 'quota illeggibile');
  assert.deepEqual([p.target, p.model, p.promptVersion, p.warnings], ['vano', 'claude-opus-5-5', V, ['le quote del lato lungo non tornano']]);
});

test('proposta: le fermate lette limitano rise.N, fdoor.N e la principale', () => {
  const p = propostaDa({
    units: 'mm',
    fields: [
      { id: 'floors', value: 3, confidence: 0.9, read: '3 fermate' },
      { id: 'rise.0', value: 3000, confidence: 0.9, read: '300' },
      { id: 'rise.1', value: 3100, confidence: 0.9, read: '310' },
      { id: 'rise.2', value: 3200, confidence: 0.9, read: '320' },
      { id: 'fdoor.2', value: 'A', confidence: 0.9, read: 'A' },
      { id: 'fdoor.3', value: 'B', confidence: 0.9, read: 'B' },
      { id: 'main', value: 3, confidence: 0.9, read: 'PT' },
      { id: 'rise.07', value: 3000, confidence: 0.9, read: '' },
    ],
    notRead: [], warnings: [],
  }, 'vano', 'm', V);
  assert.ok(p);
  assert.deepEqual(p.fields.map((f) => f.id), ['floors', 'rise.0', 'rise.1', 'fdoor.2']);
  assert.deepEqual(p.notRead.map((n) => [n.id, n.code]), [['rise.2', 'fuoriIntervallo'], ['fdoor.3', 'fuoriIntervallo'], ['main', 'fuoriIntervallo']]);
  assert.match(p.notRead[0]?.reason ?? '', /3 fermate/);
});

test('proposta: testi semplici e corti, al massimo 10 avvisi, unità sconosciuta, il modello', () => {
  const long = 'x'.repeat(500), evil = 'riga\u0000uno‮eno\nfine';
  const p = propostaDa({
    units: 'pollici',
    fields: [{ id: 'room.H', value: 2200, confidence: Number.NaN, read: evil, note: long }],
    notRead: [{ id: 'room.slab', reason: long }],
    warnings: [...Array.from({ length: 14 }, (_, i) => `avviso ${i}`), 42, long],
  }, 'locale', `claude-opus-5\u0007${long}`, V);
  assert.ok(p);
  assert.equal(p.units, 'unknown');
  const f = p.fields[0];
  assert.ok(f);
  assert.equal(f.confidence, 0);
  assert.equal(f.read, 'riga uno eno fine');
  assert.equal(f.note?.length, 120);
  assert.equal(p.notRead[0]?.reason.length, 120);
  assert.equal(p.warnings.length, 10);
  assert.ok(p.warnings.every((w) => w.length <= 200));
  assert.equal(p.model.length, 80);
  // no control or direction character survives in any text
  const texts = [f.read, f.note ?? '', ...p.notRead.map((x) => x.reason), ...p.warnings, p.model];
  assert.ok(texts.every((t) => [...t].every((ch) => (ch.codePointAt(0) ?? 0) >= 0x20 && ch !== '\u202e')), 'plain texts');
});

test('proposta: i campi di un altro obiettivo non passano (W del vano non è del locale)', () => {
  const p = propostaDa({ units: 'mm', fields: [{ id: 'W', value: 1600, confidence: 1, read: '' }, { id: 'shaft.W', value: 1600, confidence: 1, read: '' }], notRead: [], warnings: [] }, 'locale', 'm', V);
  assert.deepEqual(p?.fields.map((x) => x.id), ['shaft.W']);
  const q = propostaDa({ units: 'mm', fields: [{ id: 'governor.ropes', value: 'sì', confidence: 1, read: '' }, { id: 'existingSupport.keep', value: false, confidence: 1, read: '' }], notRead: [], warnings: [] }, 'locale', 'm', V);
  assert.deepEqual(q?.fields.map((x) => [x.id, x.value]), [['existingSupport.keep', false]]);
  assert.deepEqual(q?.notRead.map((x) => [x.id, x.code]), [['governor.ropes', 'tipo']]);
});

test('proposta: una risposta senza l’elenco dei campi non è una proposta', () => {
  for (const bad of [null, 'testo', 42, [], {}, { fields: 'W=1600' }, { fields: [{ value: 1 }].concat(Array(1001).fill({ id: 'W', value: 1 })) }]) {
    assert.equal(propostaDa(bad, 'vano', 'm', V), null, JSON.stringify(bad)?.slice(0, 40));
  }
  assert.deepEqual(propostaDa({ fields: [] }, 'vano', 'm', V), { target: 'vano', units: 'unknown', fields: [], notRead: [], warnings: [], model: 'm', promptVersion: V });
});

test('proposta: un campo dato più volte tiene il primo valore utilizzabile, un solo «doppio» per campo, chiavi distinte', () => {
  const p = propostaDa({
    units: 'mm',
    fields: [
      { id: 'W', value: '160', confidence: 0.9, read: '160' },
      { id: 'W', value: 1600, confidence: 0.9, read: '1600' },
      { id: 'W', value: 1650, confidence: 0.9, read: '1650' },
      { id: 'W', value: 1700, confidence: 0.9, read: '1700' },
      { id: 'D', value: 1750, confidence: 0.9, read: '175' },
      { id: 'D', value: 1800, confidence: 0.9, read: '180' },
    ],
    notRead: [], warnings: [],
  }, 'vano', 'm', V);
  assert.ok(p);
  assert.deepEqual(p.fields.map((f) => [f.id, f.value]), [['W', 1600], ['D', 1750]], 'the first value that can be used');
  assert.deepEqual(p.notRead.map((n) => [n.id, n.code]), [['W', 'tipo'], ['W', 'doppio'], ['D', 'doppio']]);
  assert.match(p.notRead.find((n) => n.code === 'doppio')?.reason ?? '', /primo valore utilizzabile/);
  // the same field may be listed twice (a value refused, a later one kept): the panel's keys still differ
  const keys = p.notRead.map(chiaveNonLetto);
  assert.equal(new Set(keys).size, keys.length);
  // a stop given twice and beyond the stops read: its two lines differ too
  const q = propostaDa({ units: 'mm', fields: [{ id: 'floors', value: 3, confidence: 1, read: '' }, { id: 'rise.4', value: 3000, confidence: 1, read: '' }, { id: 'rise.4', value: 3100, confidence: 1, read: '' }], notRead: [], warnings: [] }, 'vano', 'm', V);
  assert.deepEqual(q?.notRead.map((n) => [n.id, n.code]), [['rise.4', 'doppio'], ['rise.4', 'fuoriIntervallo']]);
  const qk = (q?.notRead ?? []).map(chiaveNonLetto);
  assert.equal(new Set(qk).size, 2);
});
