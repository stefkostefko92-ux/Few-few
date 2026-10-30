// Round 46 S4 (B3, B4): the speed and the travel the logbook counts as changed are parts of the test by the rule, as the
// load the documented loads change — never kept as the designer's answer, locked «Sì» with their reason in a
// modernisation, a refusal of a «Solo argano» —; the ratio of the suspended loads under UNI 10411-1 (6.1); the gaps of
// the scope closed (the speed in the traction and the ropes, the travel in the headroom, the pit and the rails, the load
// in the safety gears and the buffers) and the parts that bring a check under UNI 10411-1 only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import type { CheckId } from '@/calc/types';
import { AUTO_PARTI, ambitoOf, choiceOf, collaudoOf, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import { interventoValido, tipoDaRivedere } from '@/lib/lift/intervento';
import { bloccata, daIndicare, sceltaSalvata } from '@/lib/lift/risposte';
import type { Libretto } from '@/lib/lift/modifica';

/** An existing lift's calculation with the design's speed `v` [m/s] and travel `H` [m]. */
const V = (v: number, H = 18): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: String(H) });
const C1 = (libretto: Libretto, parti: readonly Parte[] = ['machine'], norma: Collaudo['norma'] = '10411-1'): Collaudo => ({ norma, parti, libretto });
const parti = (v: number, lib: Libretto, norma: Collaudo['norma'] = '10411-1', H = 18): readonly Parte[] => collaudoOf(V(v, H), C1(lib, ['machine'], norma)).parti;

test('velocità per la -1: oltre il 5 % sopra il maggiore tra libretto e 50 Hz, oltre il 5 % sotto il libretto', () => {
  assert.ok(!parti(1.05, { v: 1 }).includes('speed'), '+5,00 %: no');
  assert.ok(parti(1.0501, { v: 1 }).includes('speed'), '+5,01 %: sì');
  assert.ok(!parti(1.1, { v: 1, v50: 1.06 }).includes('speed'), 'riferimento 1,06 m/s dopo i 50 Hz: +3,8 %');
  assert.ok(parti(1.12, { v: 1, v50: 1.06 }).includes('speed'), '+5,7 % sul riferimento a 50 Hz');
  assert.ok(!parti(0.95, { v: 1 }).includes('speed'), '−5,00 %: no');
  assert.ok(parti(0.9499, { v: 1 }).includes('speed'), '−5,01 %: sì (15.16)');
});

test('velocità per la -11: ogni variazione oltre l’arrotondamento; corsa: ogni variazione, oltre 8 m solo avviso', () => {
  assert.ok(parti(1.01, { v: 1 }, '10411-11').includes('speed'), '+0,01 m/s');
  assert.ok(!parti(1.004, { v: 1 }, '10411-11').includes('speed'), '+0,004 m/s: arrotondamento');
  assert.ok(parti(1, { v: 1, H: 10 }, '10411-1', 18).includes('travel'), '+8,00 m: variata, ancora una modifica');
  assert.ok(parti(1, { v: 1, H: 20 }, '10411-1', 18).includes('travel'), 'accorciata');
  assert.ok(!parti(1, { v: 1, H: 18.05 }, '10411-1', 18).includes('travel'), '0,05 m: arrotondamento');
  // nothing documented: nothing by the rule
  assert.deepEqual(collaudoOf(V(1.5, 30), { norma: '10411-1', parti: ['machine'] }).parti, ['machine']);
  // a new lift is tested with every part, whatever the logbook says
  assert.equal(collaudoOf({ ...V(1.5), context: 'new' }, C1({ v: 1 })).norma, 'en81');
});

test('le parti per regola non sono risposte: choiceOf e sceltaSalvata le tolgono, quelle scelte restano', () => {
  assert.deepEqual(AUTO_PARTI, ['load', 'speed', 'travel']);
  const chosen = C1({ v: 1, H: 15 }), C = collaudoOf(V(1.2, 18), chosen);
  assert.deepEqual(C.parti, ['machine', 'speed', 'travel']);
  assert.deepEqual(choiceOf(C, chosen), ['machine']);
  assert.deepEqual(sceltaSalvata(V(1.2, 18), C).parti, ['machine'], 'il record salvato normalizzato: di nuovo la scelta');
  const mine = C1({ v: 1, H: 15 }, ['machine', 'speed']);
  assert.deepEqual(choiceOf(collaudoOf(V(1.2, 18), mine), mine), ['machine', 'speed'], 'la velocità scelta dal progettista resta');
  // the rule no longer gives it (the logbook changed): the stored part stays, answered
  assert.deepEqual(sceltaSalvata(V(1, 15), C).parti, ['machine', 'speed', 'travel']);
});

test('ammodernamento: velocità e corsa del libretto bloccate su «Sì» con il loro motivo; non da indicare', () => {
  const chosen = C1({ v: 1, H: 15 }, ['machine', 'controller']), Vx = V(1.2, 18), C = collaudoOf(Vx, chosen);
  assert.deepEqual(bloccata('AMMODERNAMENTO', chosen, C, Vx, 'speed'), { si: true, perche: 'velocita' });
  assert.deepEqual(bloccata('AMMODERNAMENTO', chosen, C, Vx, 'travel'), { si: true, perche: 'corsa' });
  assert.equal(bloccata('AMMODERNAMENTO', chosen, C, Vx, 'load'), null, 'nessun carico documentato');
  assert.ok(!daIndicare('AMMODERNAMENTO', chosen, C, Vx, ['machine', 'controller']).some((p) => p === 'speed' || p === 'travel'));
  // «Solo argano»: speed and travel are not its parts — the save refuses ('velocita', 'corsa'), the form warns
  assert.equal(bloccata('SOLO_ARGANO', chosen, C, Vx, 'speed'), null);
  assert.deepEqual(interventoValido('SOLO_ARGANO', Vx, C1({ v: 1, H: 15 })), ['velocita', 'corsa']);
  assert.deepEqual(interventoValido('AMMODERNAMENTO', Vx, chosen), []);
  // the Progetto: a «Solo argano» whose derived test gets the travel or the speed
  assert.equal(tipoDaRivedere('SOLO_ARGANO', { parti: ['machine', 'travel'] }), true);
  assert.equal(tipoDaRivedere('SOLO_ARGANO', { parti: ['machine', 'ropes'] }), false);
  assert.equal(tipoDaRivedere('AMMODERNAMENTO', { parti: ['machine', 'travel'] }), false);
});

type Id = CheckId | ShaftCheckId;
/** The new links of round 46: the part, the checks it brings under both parts of UNI 10411, and under -1 only. */
const LINKS: readonly [Parte, readonly Id[], readonly Id[]][] = [
  ['speed', ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'tr_stall', 'tr_msr1', 'r_sfa', 'g_press', 'gr_stress', 'gr_flange', 'gr_defl', 'gr_cw'], ['p_screen', 'p_screenlo', 'p_screenw']],
  ['travel', ['r_sfa', 'h_refuge', 'h_clear', 'h_top', 'h_cw', 'h_guide', 'h_hung', 'h_cwgap', 'h_refuge_rig', 'h_stand_rig', 'p_refuge', 'p_apron', 'gr_stress',
    'gr_flange', 'gr_defl', 'gr_cw'], ['p_screen', 'p_screenlo', 'p_screenw']],
  ['load', ['gr_cw', 'sg_cw', 'sg_type', 'b_car', 'b_cw'], ['p_screen', 'p_screenlo', 'p_screenw']],
  ['controller', [], ['b_sets', 'b_one']],
];

test('ambito (B4): ogni nuovo legame porta la sua verifica nell’esito, quelli della sola -1 solo con la -1', () => {
  for (const [p, both, only1] of LINKS) {
    for (const id of both) for (const norma of ['10411-1', '10411-11'] as const) assert.equal(ambitoOf({ norma, parti: [p] }, id), 'applies', `${p} → ${id} (${norma})`);
    for (const id of only1) {
      assert.equal(ambitoOf({ norma: '10411-1', parti: [p] }, id), 'applies', `${p} → ${id} (-1)`);
      assert.equal(ambitoOf({ norma: '10411-11', parti: [p] }, id), 'existing', `${p} → ${id}: la -11 non lo chiede`);
    }
  }
  // under -11 the screen with the speed and the brake's sets with a new controller stay existing (11.1.3: watched only)
  assert.equal(ambitoOf({ norma: '10411-11', parti: ['speed'] }, 'p_screen'), 'existing');
  assert.equal(ambitoOf({ norma: '10411-11', parti: ['controller'] }, 'b_one'), 'existing');
  // the machine room stays the building's; the governor's checks are not the travel's
  for (const id of ['m_height', 'm_door', 'm_pheight', 'm_pdoor'] as const) assert.equal(ambitoOf({ norma: '10411-1', parti: ['speed', 'travel', 'load', 'controller'] }, id), 'existing', id);
});
