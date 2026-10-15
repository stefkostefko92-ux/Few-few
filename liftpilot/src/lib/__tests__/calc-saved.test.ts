// «Calcolo argano» saves what the form shows (round 46, src/lib/calc-saved.ts): one rule for the rows in view and for
// what the save asks for (fields.ts inForm), the fields out of view at the value the engine reads in their place. The
// demo of round 45 was stopped by fields the form hid (dx, h, Hv, Dp, Jp, o_mass): every layout, roping and type from a
// blank start, filled with exactly what the list of what is missing names, saves; the results stay the same bit for bit
// whatever the hidden fields held; the Progetto drawn on such a calculation saves too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import { snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { FIELD_IDS, inForm, shown } from '@/components/calc/fields';
import { blankCalc, calcMissing } from '@/lib/calc-blank';
import { visibleBad } from '@/lib/calc-input';
import { neutralOf, outOfView, savedValues } from '@/lib/calc-saved';
import { deriveLift, interventoTo, macchinaResta, newLift, type Collaudo, type TipoIntervento } from '@/lib/lift';
import { rispondi } from '@/lib/lift/risposte';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { mirrorRopes } from '@/lib/present/analysis';
import { buildReport } from '@/lib/report/build';

const LAYOUTS = ['top', 'topDefl', 'bottom'] as const;
const ROPINGS = ['1', '2'] as const;
/** The types as the form sets them: a modernisation also with «Argano: No» (the machine kept, not compared). */
const TIPI = ['SOLO_ARGANO', 'AMMODERNAMENTO', 'AMMODERNAMENTO_RESTA', 'TRASFORMAZIONE_COMPLETA'] as const;
type Caso = (typeof TIPI)[number];

/** A value for each field the list may ask for: the examples' (the deflector at the example's distance). */
const SOURCE: FormValues = { ...PRESETS.B, ...PRESETS.A, context: '', compare: true, layout: '', r: '', alphaMode: 'geo' };

/** A blank start with a type chosen as useIntervento sets it (src/components/calc/useIntervento.ts). */
function start(caso: Caso, layout: string, r: string): { V: FormValues; C: Collaudo; tipo: TipoIntervento } {
  const tipo: TipoIntervento = caso === 'AMMODERNAMENTO_RESTA' ? 'AMMODERNAMENTO' : caso;
  const t = interventoTo(tipo);
  const C = caso === 'AMMODERNAMENTO_RESTA' ? rispondi(t.collaudo, 'machine', false) : t.collaudo;
  const compare = caso !== 'TRASFORMAZIONE_COMPLETA' && caso !== 'AMMODERNAMENTO_RESTA';
  return { V: { ...blankCalc(), ...t.values, compare, keepD: false, layout, r }, C, tipo };
}

/** The form filled with exactly what the list of what is missing names, as a user types it. */
function fillMissing(V0: FormValues): FormValues {
  let V = V0;
  for (let round = 0; round < 6; round++) {
    const missing = calcMissing(V, readInputs(V).bad);
    if (!missing.length) return V;
    V = mirrorRopes({ ...V, ...Object.fromEntries(missing.map((id) => [id, SOURCE[id] ?? ''])) });
  }
  return V;
}

/** Every field out of view set to a value somebody typed under another layout or type (valid, not the engine's). */
function typedElsewhere(V: FormValues): FormValues {
  const garbage: Record<string, string | number | boolean> = { dx: 0.32, h: 0.65, Hv: 21, Dp: 300, Jp: 1.5, alphaManual: 170, ae: 0.9, machineStd: 'en81-1',
    stallDevice: true, keepD: true, dropAlign: 'car', n_beta: 100, o_beta: 100 };
  const out: Record<string, FormValues[string]> = { ...V };
  for (const id of outOfView(V)) out[id] = id in garbage ? garbage[id] : id.startsWith('o_') ? (PRESETS.B[id] ?? '') : neutralOf(id);
  return out;
}

const cases = LAYOUTS.flatMap((layout) => ROPINGS.flatMap((r) => TIPI.map((caso) => ({ layout, r, caso }))));

test('da un calcolo vuoto, compilato solo con ciò che la lista chiede: salvabile in ogni disposizione, taglia e tipo', () => {
  for (const { layout, r, caso } of cases) {
    const tag = `${caso} ${layout} ${r}:1`, { V: V0 } = start(caso, layout, r), V = fillMissing(V0);
    assert.deepEqual(calcMissing(V, readInputs(V).bad), [], `${tag}: nothing missing`);
    // the server's check (save.ts createCalculation): nothing flagged once the fields out of view are at their value
    assert.deepEqual(readInputs(savedValues(V)).bad, [], `${tag}: the save takes it`);
    // the demo's fields are flagged blank in the raw values exactly where the form hides them
    for (const id of readInputs(V).bad) assert.equal(inForm(id, V), false, `${tag}: ${id} flagged and out of view`);
  }
});

test('una sola regola: ciò che il salvataggio rifiuta è ciò che il modulo segna, in ogni stato', () => {
  for (const { layout, r, caso } of cases) {
    const { V: V0 } = start(caso, layout, r), half = { ...V0, ...Object.fromEntries(['Q', 'P', 'v', 'H', 'o_D', 'n_D'].map((id) => [id, SOURCE[id] ?? ''])) };
    for (const V of [V0, half, fillMissing(V0), { ...fillMissing(V0), n_Jm: -1, Jp: -1, Hv: -3, dx: '' }]) {
      // the new ropes that follow the existing ones are refused with them (mirrorRopes): named by the existing ones
      const refused = readInputs(savedValues(V)).bad, flagged = visibleBad(readInputs(V).bad, V).sort();
      assert.deepEqual(visibleBad(refused, V).sort(), flagged, `${caso} ${layout} ${r}:1`);
      assert.equal(refused.length > 0, flagged.length > 0, `${caso} ${layout} ${r}:1: refused only with something to correct in view`);
    }
  }
});

test('i campi non mostrati non cambiano il risultato: lo stesso calcolo bit per bit', () => {
  for (const { layout, r, caso } of cases) {
    const tag = `${caso} ${layout} ${r}:1`, V = fillMissing(start(caso, layout, r).V), saved = savedValues(V), other = typedElsewhere(V);
    assert.notDeepEqual(other, saved, `${tag}: something hidden typed`);
    const a = snapshotOf(saved).results, b = snapshotOf(mirrorRopes(other)).results;
    for (const k of ['res', 'old', 'window', 'sens', 'sizing'] as const) assert.equal(JSON.stringify(a[k]), JSON.stringify(b[k]), `${tag}: ${k}`);
    // nothing typed elsewhere is stored: the same values as from the form that never held it
    assert.deepEqual(savedValues(other), saved, `${tag}: stored as shown`);
    assert.deepEqual(savedValues(saved), saved, `${tag}: idempotent`);
    for (const id of FIELD_IDS) if (inForm(id, V)) assert.equal(saved[id], mirrorRopes(V)[id], `${tag}: ${id} in view, as typed`);
  }
});

test('massa dell’argano esistente: chiesta in ogni posizione quando è confrontato (P9, gancio, masse da sollevare)', () => {
  for (const layout of LAYOUTS) {
    const { V } = start('SOLO_ARGANO', layout, '1');
    assert.ok(shown('o_mass', V) && calcMissing(V, readInputs(V).bad).includes('o_mass'), layout);
    const { V: resta } = start('AMMODERNAMENTO_RESTA', layout, '1');
    assert.ok(!calcMissing(resta, readInputs(resta).bad).includes('o_mass'), `${layout}: the machine kept is not compared`);
  }
});

test('Progetto su un calcolo salvato da vuoto: nessun valore del calcolo che il Progetto non può correggere', () => {
  const L = newLift();
  for (const layout of LAYOUTS) {
    for (const caso of ['SOLO_ARGANO', 'AMMODERNAMENTO_RESTA', 'TRASFORMAZIONE_COMPLETA'] as const) {
      const { V: V0, C, tipo } = start(caso, layout, '1'), values = savedValues(fillMissing(V0));
      assert.equal(macchinaResta(tipo, C), caso === 'AMMODERNAMENTO_RESTA');
      const p = { ...progettoOf({ ...L, calc: { ...L.calc, layout } }), ...(layout === 'bottom' ? { bottom: 'head' as const } : {}) };
      const d = deriveLift(liftInputsOf(p, { values, collaudo: C }));
      const hidden = d.analysis.ctx.bad.filter((id) => !inForm(id, values));
      assert.deepEqual(hidden, [], `${caso} ${layout}: no hidden field refused`);
    }
  }
});

test('relazione di un calcolo salvato da vuoto: nessun buco, nessun valore che il modulo non mostrava', () => {
  const words = (doc: ReturnType<typeof buildReport>): string[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows.flat() : b.t === 'grid' ? [...b.head, ...b.rows.flat()]
    : b.t === 'list' ? b.items : 'text' in b && typeof b.text === 'string' ? [b.text] : []));
  const labels = (doc: ReturnType<typeof buildReport>): string[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows.map((row) => row[0] ?? '') : []));
  // a direct pull with extra bends: their pulleys' diameter, not the inertia it does not read
  const bends = cases.filter((c) => c.layout === 'top' && c.r === '1').map((c) => ({ ...c, nps: 1 }));
  for (const { layout, r, caso, nps } of [...cases.map((c) => ({ ...c, nps: 0 })), ...bends]) {
    const tag = `${caso} ${layout} ${r}:1 +${nps}`, { V: V0, tipo } = start(caso, layout, r), values = savedValues(fillMissing({ ...V0, nps }));
    const doc = buildReport({
      calc: { id: 'cmtest0046', label: null, createdAt: new Date('2026-10-15T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.6.0', profileId: 'IT-2026.1', author: 'Marco Rossi' },
      project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: null, client: null },
      company: 'Ditta di prova', values, reviews: [], tipo,
    });
    const all = words(doc), keys = labels(doc);
    for (const bad of ['undefined', 'NaN', '[object Object]']) assert.ok(!all.some((x) => x.includes(bad)), `${tag}: «${bad}»`);
    assert.ok(doc.blocks.every((b) => b.t !== 'kv' || b.rows.every((row) => row.every((cell) => cell.trim() !== ''))), `${tag}: no empty cell`);
    // the geometry of another layout or roping is never printed
    assert.equal(keys.some((k) => k.startsWith('Rinvio: distanza orizzontale')), layout === 'topDefl', `${tag}: dx`);
    assert.equal(keys.some((k) => k.startsWith('Distanza verticale testata')), layout === 'bottom', `${tag}: Hv`);
    assert.equal(keys.some((k) => k.includes('Inerzia per puleggia')), shown('Jp', values), `${tag}: Jp`);
    assert.equal(keys.some((k) => k.startsWith('Diametro pulegge di rinvio')), layout !== 'top' || r === '2' || nps > 0, `${tag}: Dp`);
  }
});
