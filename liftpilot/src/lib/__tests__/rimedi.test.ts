// The remedies of a check (round 54): the search finds the least change that passes, the way that helps, within what
// the screen takes; a list's entries and a distance given back are tried as they are; it stops when asked. On the
// Progetto: every check of the shaft has its levers or is another screen's, and a remedy found sets the drawing as
// «Applica» would, with which the check passes and one step less does not. «Calcolo argano» and the machine room
// surveyed: a remedy changes one value and passes; what is the installation's is never a lever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift } from '@/lib/lift';
import { baseOf, composto, progettoOf } from '@/lib/lift/progetto';
import { conVano } from '@/lib/lift/progetto-edit';
import { Interrotta, cercaRimedi } from '@/lib/rimedi/cerca';
import { esitoLift, rimediProgetto } from '@/lib/rimedi/progetto';
import type { Esito, Leva, LevaNum } from '@/lib/rimedi/tipi';
import { ALTROVE, leveDi, leveSenzaCosto } from '@/lib/rimedi/vano';
import { withValue, type ShaftCheckId } from '@/shaft';
import { K } from '@/calc/norme';
import { PRESETS } from '@/calc/presets';
import { esitoCalc, leveCalcolo, rimediCalcolo } from '@/lib/rimedi/calcolo';
import { esitoLocale, leveLocale, rimediLocale } from '@/lib/rimedi/locale';
import { startSurvey } from '@/lib/room/survey';
import { s206, s37 } from './fuzz-fixtures';

// a design of one number: the check passes at 100 and over, «Attenzione» up to 110 when asked
const esito = (x: number, warn = false): Esito => {
  const m = x - 100, problemi = new Map<string, 'fail' | 'warn'>();
  if (m < 0) problemi.set('c', 'fail');
  else if (warn && m < 10) problemi.set('c', 'warn');
  if (x > 150) problemi.set('altra', 'fail');
  return { problemi, margini: new Map([['c', m]]) };
};
const num = (dir: 1 | -1 | 0, da = 40, min = 0, max = 400): LevaNum<number> => ({ tipo: 'num', key: 'x', costo: 'componente', da, dir, passo: 5, min, max, set: (_I, x) => x });

test('rimedi: the least value that passes, on the step, the way that helps', async () => {
  const r = await cercaRimedi(40, esito(40), 'c', [num(0)], (x) => esito(x));
  assert.equal(r.length, 1);
  assert.equal(r[0]?.a, 100);
  assert.deepEqual(r[0]?.nuovi, []);
  // one step less does not pass
  assert.ok(esito(95).problemi.has('c'));
});

test('rimedi: past the limit until «Attenzione» goes; within the range and what the screen takes', async () => {
  const [r] = await cercaRimedi(40, esito(40, true), 'c', [num(1)], (x) => esito(x, true));
  assert.equal(r?.a, 110);
  const [far] = await cercaRimedi(40, esito(40), 'c', [num(1, 40, 0, 90)], (x) => esito(x));
  assert.equal(far, undefined, 'nothing beyond its range');
  const [broken] = await cercaRimedi(40, esito(40), 'c', [{ ...num(1), set: (_I: number, x: number) => (x < 160 ? null : x) }], (x) => esito(x));
  assert.equal(broken, undefined, 'a value the screen refuses is no remedy');
});

test('rimedi: the wrong way finds nothing; an entry and a distance given back are tried as they are', async () => {
  assert.deepEqual(await cercaRimedi(40, esito(40), 'c', [num(-1)], (x) => esito(x)), []);
  const scelta: Leva<number> = { tipo: 'scelta', key: 's', costo: 'componente', da: 'a', opzioni: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], set: (_I, id) => (id === 'b' ? 120 : 160) };
  const togli: Leva<number> = { tipo: 'togli', key: 't', costo: 'disegno', da: 40, set: () => 100 };
  const r = await cercaRimedi(40, esito(40), 'c', [scelta, togli], (x) => esito(x), { quanti: 5 });
  assert.deepEqual(r.map((x) => [x.key, x.a]), [['t', null], ['s', 'b']], 'none broken first, then the cheapest');
});

test('rimedi: a value that makes another check fail is no remedy', async () => {
  // the check passes only from 160, where the other one stops passing
  const solo160 = (x: number): Esito => ({ problemi: new Map<string, 'fail' | 'warn'>([...(x < 160 ? [['c', 'fail'] as const] : []), ...(x > 150 ? [['altra', 'fail'] as const] : [])]), margini: new Map([['c', x - 160]]) });
  assert.deepEqual(await cercaRimedi(40, solo160(40), 'c', [num(1)], solo160), []);
});

test('rimedi: stopped when asked', async () => {
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(cercaRimedi(40, esito(40), 'c', [num(0)], (x) => esito(x), { signal: stop.signal }), Interrotta);
});

test('rimedi: every check of the shaft has levers or another screen puts it right; every lever has a cost', () => {
  const ids: ShaftCheckId[] = ['v_fit', 'v_area', 'v_acc_car', 'v_acc_door', 'v_acc_side', 'v_call', 'v_door', 'v_cw', 'h_refuge', 'h_parapet', 'p_refuge', 'b_runby', 'm_height', 'm_free', 'gr_stress'];
  for (const id of ids) assert.ok(leveDi(id).length > 0 || ALTROVE[id], id);
  assert.deepEqual(leveSenzaCosto(), []);
});

for (const [name, f, id] of [['s206', s206, 'h_refuge'], ['s37', s37, 'p_refuge']] as const) {
  test(`rimedi: the Progetto of ${name} — ${id}'s remedies set the drawing so that it passes, one step less does not`, async () => {
    const L = f(), form = { progetto: progettoOf(L), blank: [] }, base = baseOf(L), derived = deriveLift(composto(form, base).inputs), c = { form, base, derived };
    assert.ok(esitoLift(derived).problemi.has(id), `${id} does not pass to begin with`);
    const rimedi = await rimediProgetto(c, id, (k) => k);
    assert.ok(rimedi.length > 0, 'a remedy');
    for (const r of rimedi) {
      const after = deriveLift(composto(conVano(form, base, r.inputs, derived), base).inputs);
      assert.ok(!esitoLift(after).problemi.has(id), `${r.key} → ${String(r.a)} puts it right`);
      if (r.tipo === 'num' && typeof r.a === 'number' && typeof r.da === 'number') {
        const step = Math.sign(r.a - r.da) * (Math.abs(r.da) < 300 ? 5 : 10), less = withValue(r.inputs, r.key, r.a - step);
        if (less && Math.abs(r.a - r.da) > Math.abs(step)) {
          const before = deriveLift(composto(conVano(form, base, less, derived), base).inputs);
          assert.ok(esitoLift(before).problemi.has(id), `${r.key} one step less still fails`);
        }
      }
    }
  });
}

test('rimedi: «Calcolo argano» — a remedy found passes the check with the values it sets; a machine kept leaves the car only', async () => {
  for (const k of ['A', 'B', 'C'] as const) {
    const V = PRESETS[k], c = { values: V, collaudo: null, resta: false };
    for (const [id] of esitoCalc(V, null).esito.problemi) {
      for (const r of await rimediCalcolo(c, id, (g) => g)) {
        assert.ok(!esitoCalc(r.inputs, null).esito.problemi.has(id), `${k} ${id}: ${r.key} → ${String(r.a)}`);
        assert.equal(Object.keys(r.inputs).filter((x) => r.inputs[x] !== V[x]).join(), r.key, 'one value changed');
      }
    }
  }
  // the groove's angles and the ropes within the standard's bounds
  const nuova = leveCalcolo({ values: PRESETS.A, collaudo: null, resta: false }, (g) => g);
  const beta = nuova.find((l) => l.key === 'n_beta'), d = nuova.find((l) => l.key === 'n_d');
  assert.equal(beta?.tipo === 'num' ? beta.max : null, K.betaMax);
  assert.equal(d?.tipo === 'num' ? d.min : null, K.ropeDiameterMin);
  const kept = leveCalcolo({ values: PRESETS.A, collaudo: null, resta: true }, (g) => g).map((l) => l.key);
  assert.deepEqual(kept, ['P', 'k', 'qeq'].filter((x) => kept.includes(x)));
});

test('rimedi: the machine room surveyed — the room\'s height for its headroom, the shaft and the drops never levers', async () => {
  const V = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, s0 = startSurvey(780), s = { ...s0, room: { ...s0.room, W: 1900, D: 1900, H: 1850 } };
  assert.ok(esitoLocale(V, s).esito.problemi.has('m_height'));
  const [r] = await rimediLocale({ values: V, survey: s }, 'm_height', (k) => k);
  assert.equal(r?.key, 'room.H');
  assert.ok(r && !esitoLocale(V, r.inputs).esito.problemi.has('m_height'));
  for (const id of ['m_height', 'm_fit', 'm_free', 'm_route', 'm_beam']) {
    for (const l of leveLocale(id, s, (k) => k)) assert.ok(!/^(shaft|car|cw)\./.test(l.key), `${id}: ${l.key}`);
  }
});
