// A direct pull on an existing lift whose existing machine is compared keeps its falls (round 46, src/lib/lift/calata.ts):
// the derivation checks the plan's drop against the existing sheave (Ø 560 in the walk), whatever the new one (D 400),
// and the Progetto could not save out of the box. The plan's drop starts at the existing falls once the drawing is
// complete, and is set to them with one click; on a plan's own falls (a transformation) nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { blankProgetto, progettoOf, type ProgettoDraft } from '@/lib/lift/progetto';
import { calateAlCompleto, calateEsistenti, conCalateEsistenti, verificaKey } from '@/lib/lift/calata';
import it from '../../../messages/it.json';

const walk = (r: '1' | '2'): LiftInputs => {
  const L = newLift();
  return { ...L, calc: { ...L.calc, layout: 'top', context: 'repl', compare: true, keepD: false, o_D: 560, o_mass: 500, r } };
};

test('calate esistenti: la calata in pianta portata a Ø 560, il progetto si salva (1:1 e 2:1)', () => {
  for (const r of ['1', '2'] as const) {
    const L = walk(r), d = deriveLift(L);
    assert.equal(calateEsistenti(L.calc), 560);
    assert.ok(d.issues.includes('calata'), `${r}:1 — the software's placement (${d.calata} mm) is not the existing falls`);
    const S = conCalateEsistenti(L.shaft, d, 560);
    assert.ok(S, `${r}:1 — the drop can be set`);
    const after = deriveLift({ ...L, shaft: S });
    assert.deepEqual(after.issues, [], `${r}:1 — nothing left to correct`);
    assert.ok(Math.abs((after.calata ?? 0) - 560) < 1, `${r}:1 — falls at the existing ones`);
  }
  // a plan's own falls (a new lift, or no existing machine compared): none to keep
  assert.equal(calateEsistenti({ ...walk('1').calc, compare: false }), null);
  assert.equal(calateEsistenti({ ...walk('1').calc, layout: 'topDefl' }), null);
});

test('il disegno che si completa parte dalle calate esistenti; uno già completo resta com’è', () => {
  const L = walk('1'), base = { values: L.calc, collaudo: L.collaudo ?? null };
  const full: ProgettoDraft = { progetto: progettoOf(L), blank: [] };
  const empty: ProgettoDraft = { progetto: { ...full.progetto, shaft: blankProgetto().progetto.shaft }, blank: blankProgetto().blank };
  const started = calateAlCompleto(empty, full, base);
  assert.notDeepEqual(started.progetto.shaft, full.progetto.shaft, 'the drop moved to the existing falls');
  assert.deepEqual(deriveLift({ ...L, shaft: started.progetto.shaft }).issues, []);
  // already complete before the change: the designer's plan as it is
  assert.deepEqual(calateAlCompleto(full, full, base), full);
});

test('sulle calate esistenti la quota «Calata» è del software: la verifica del posto le nomina, non «fissate a mano»', () => {
  const V = walk('1').calc;
  assert.equal(verificaKey('v_place', V), 'c_v_place_calate');
  assert.equal(verificaKey('v_doorcar', V), 'c_v_doorcar', 'the other checks as they are');
  for (const W of [{ ...V, compare: false }, { ...V, layout: 'topDefl' }]) assert.equal(verificaKey('v_place', W), 'c_v_place', 'a plan of its own falls');
  const shaft = (it as { shaft: Record<string, string> }).shaft;
  assert.ok(shaft.c_v_place_calate?.includes('calate esistenti') && shaft.c_v_place?.startsWith('Quote fissate a mano'));
  const lift = (it as { lift: Record<string, string> }).lift;
  assert.ok(lift.hint_calata_esistenti_place?.includes('{Do}') && lift.hint_calata_esistenti_place.includes('{m}'));
});
