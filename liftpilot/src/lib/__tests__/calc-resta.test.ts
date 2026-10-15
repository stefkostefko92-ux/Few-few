// «Argano: No» (round 46, src/lib/calc-resta.ts): the machine kept is the existing one. A calculation made after a
// replacement that took a catalogue's machine, answered «No», verifies the existing machine — its data, no model —,
// and its relazione names no catalogue's machine; «Sì» again brings back the machine replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { MACHINE } from '@/components/calc/fields';
import { arganoResta, arganoSostituito, macchinaDi, segniResta } from '@/lib/calc-resta';
import { savedValues } from '@/lib/calc-saved';
import { valuesAdvice } from '@/lib/lift/advice';
import { interventoTo } from '@/lib/lift';
import { rispondi } from '@/lib/lift/risposte';
import { valoreCalc } from '@/lib/collega/prefill';
import { mirrorRopes } from '@/lib/present/analysis';
import { buildReport } from '@/lib/report/build';

const KEYS = MACHINE('n_').map((f) => f.id.slice(2));

/** A replacement whose new machine is the advice's first (a catalogue's model with its name). */
function replaced() {
  const advice = valuesAdvice(PRESETS.C), first = advice.best[0];
  assert.ok(first, 'a catalogue machine for example C');
  return { V: mirrorRopes({ ...PRESETS.C, ...first.values }), model: `${first.brand} ${first.model}` };
}

const report = (values: Record<string, unknown>, parti: 'resta' | 'sostituito') => {
  const t = interventoTo('AMMODERNAMENTO'), C = parti === 'resta' ? rispondi(t.collaudo, 'machine', false) : t.collaudo;
  const doc = buildReport({
    calc: { id: 'cmresta001', label: null, createdAt: new Date('2026-10-15T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.6.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto', address: null, city: null, province: null, plantNumber: null, client: null }, company: 'Ditta', reviews: [],
    values: values as never, tipo: 'AMMODERNAMENTO', marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo: C },
  });
  return doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])).find((row) => row[0] === 'Costruttore e modello')?.[1] ?? null;
};

test('argano che resta dopo una sostituzione dal catalogo: i dati dell’argano esistente, nessun modello', () => {
  const { V, model } = replaced();
  assert.equal(V.n_model, model);
  assert.ok(report(V, 'sostituito')?.startsWith(model), 'the replacement names its catalogue machine');
  const kept: FormValues = { ...V, compare: false, keepD: false, ...arganoResta({ ...V, compare: false }, true) };
  assert.equal(kept.n_model, '');
  for (const k of KEYS) assert.equal(String(kept[`n_${k}`] ?? ''), String(V[`o_${k}`] === '' ? kept[`n_${k}`] : V[`o_${k}`]), k);
  assert.deepEqual([kept.n_D, kept.n_i, kept.n_mass, kept.n_n, kept.n_d, kept.n_Fmin], [V.o_D, V.o_i, V.o_mass, V.o_n, V.o_d, V.o_Fmin]);
  // saved as the form shows it: no catalogue's machine in the record nor in its relazione
  const saved = savedValues(kept);
  assert.equal(saved.n_model, '');
  assert.equal(report(saved, 'resta'), null, 'no catalogue machine named');
});

test('«Sì» di nuovo: torna l’argano sostituito; l’esistente tiene ciò che era inserito', () => {
  const { V } = replaced(), prima = macchinaDi(V);
  const kept: FormValues = { ...V, compare: false, ...arganoResta({ ...V, compare: false }, true) };
  const back: FormValues = { ...kept, compare: true, ...arganoSostituito(kept, prima) };
  for (const k of [...KEYS, 'model']) assert.equal(back[`n_${k}`], V[`n_${k}`], k);
  for (const k of KEYS) assert.equal(back[`o_${k}`], V[`o_${k}`], k);
  // no machine replaced before (a «No» saved and continued): a brand new machine to enter, the existing one entered
  const fresh = arganoSostituito({ ...kept, o_D: '' }, null);
  assert.equal(fresh.n_D, '');
  assert.equal(fresh.o_D, kept.n_D);
});

test('segni «dal rilievo» dell’argano che resta: quelli dell’argano esistente, anche nella bozza ripresa', () => {
  const valori = { o_D: '560', o_i: '45', o_n: '4', Q: '630' };
  assert.deepEqual(segniResta(valori), { ...valori, n_D: '560', n_i: '45', n_n: '4' });
  const seme = { o_D: '560', o_Pn: '5.5' };
  assert.deepEqual([valoreCalc(seme, 'n_D'), valoreCalc(seme, 'n_Pn'), valoreCalc(seme, 'n_i'), valoreCalc(seme, 'Q')], ['560', '5.5', undefined, undefined]);
});
