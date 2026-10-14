// The registry is the single source for the engineer's checklist and the report: it must cover every constant and
// every check, and its texts must say the numbers the engine uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, PROFILO, VOCI } from '../index';
import type { CheckId, Costante } from '../index';

const CHECKS: readonly CheckId[] = ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'tr_stall', 'r_dd', 'r_ddp', 'r_nd', 'g_geom', 'r_sfa',
  'd_pst', 'd_ratio', 'd_mp', 's_shaft', 'b_sets', 'b_all', 'b_one', 'b_up', 'b_amax', 's_force', 's_uplift', 'tr_msr1', 'r_two', 'v_comp', 'g_retain',
  's_fa', 's_gravity', 'g_press'];
const it = (x: number, dec?: number): string => (dec == null ? String(x) : x.toFixed(dec)).replace('.', ',');
const voce = (id: string) => {
  const v = VOCI.find((x) => x.id === id);
  assert.ok(v, `voce ${id}`);
  return v;
};

test('voci complete e con identificativo unico', () => {
  const ids = VOCI.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'identificativi duplicati');
  for (const v of VOCI) {
    for (const f of ['titolo', 'valore', 'riferimento', 'fonte'] as const) assert.ok(v[f].trim().length > 0, `${v.id}: ${f} vuoto`);
    assert.ok(['confermato', 'da_verificare', 'stima', 'derivazione', 'scelta', 'prassi'].includes(v.stato), `${v.id}: stato`);
  }
});

test('ogni costante del motore e ogni verifica sono descritte da almeno una voce', () => {
  const used = new Set(VOCI.flatMap((v) => v.costanti ?? []));
  const missing = (Object.keys(K) as Costante[]).filter((c) => !used.has(c));
  assert.deepEqual(missing, [], 'costanti senza voce');
  const checked = new Set(VOCI.flatMap((v) => v.verifiche ?? []));
  assert.deepEqual(CHECKS.filter((c) => !checked.has(c)), [], 'verifiche senza voce');
});

test('i testi delle voci riportano i numeri usati dal motore', () => {
  const pairs: [string, string][] = [
    ['trazione.mu.caricamento', `μ = ${it(K.muLoading)}`], ['trazione.mu.bloccata', `μ = ${it(K.muStalled)}`],
    ['trazione.mu.frenatura', `${it(K.muBrakingBase)} / (1 + v_f/${K.muBrakingSpeed})`],
    ['trazione.carico.caricamento', `${it(K.loadTestFactor)}·Q`], ['trazione.decelerazione.minima', `${it(K.aeMin)} m/s²`],
    ['trazione.decelerazione.corsa.ridotta', `${it(K.aeReducedStroke)} m/s²`], ['trazione.margine', `> ${it(K.tractionWarn)}`],
    ['gole.limite.beta', `β ≤ ${K.betaMax}°`], ['gole.raccomandazione.beta', `β ≤ ${K.betaRecommended}°`], ['gole.limite.gamma', `γ ≥ ${K.gammaMin}°`],
    ['gole.limite.gamma.U', `γ ≥ ${K.gammaMinU}°`],
    ['funi.Dd', `D/d ≥ ${K.ddMin}`], ['funi.Dpd', `Dp/d ≥ ${K.ddMin}`], ['funi.numero', `almeno ${K.ropesMin}`], ['funi.diametro', `d ≥ ${K.ropeDiameterMin} mm`],
    ['funi.Sf.minimo', `${K.sfMin3} con tre`], ['funi.Sf.minimo', `${K.sfMin2} con due`],
    ['funi.Sf.formula', `${it(K.sfC0)}`], ['funi.Sf.formula', `695,85·10^6`], ['funi.Sf.formula', `^${it(K.sfE1)}`], ['funi.Sf.formula', `${it(K.sfC2)}`], ['funi.Sf.formula', `^−${it(-K.sfE2)}`],
    ['funi.Nequiv.pulegge', `^${K.kpExponent}`], ['funi.Nequiv.pulegge', `${K.reverseBendWeight}·N_pr`],
    ['freno.gruppi', `almeno ${K.brakeSetsMin}`], ['soccorso.forza', `≤ ${K.rescueForceMax} N`], ['soccorso.meccanico', `bastano ${K.rescueForceMech} N`],
    ['soccorso.meccanico', `(q − ${it(K.rescueLoadBand)})·Q`], ['soccorso.meccanico', `entro ${K.rescueHours} h`], ['soccorso.meccanico', `${it(K.rescueSpeed, 2)} m/s`],
    ['soccorso.forza', `${it(K.rescueSpeed, 2)} m/s`], ['soccorso.forza', `${it(K.rescueSpeedOld, 2)} m/s`],
    ['modello.velocita', `oltre ${it(K.vCompGuided)} m/s`], ['modello.velocita', `oltre ${K.vCompRopes} m/s`],
    ['funi.trattenuta', `più di ${K.retainBelow}°`], ['funi.trattenuta', `supera ${K.retainWrap}°`], ['funi.due', `con ${K.ropesMin} funi`],
    ['azionamento.accelerazione', `${K.accelTorqueRatioMax} volte`],
    ['azionamento.margine', `${Math.round(K.nearLimit * 100)}%`], ['modello.sensibilita', `P ±${Math.round(K.sensP * 100)}%`], ['modello.sensibilita', `k ±${it(K.sensK)}`],
    ['modello.g', `g = ${it(K.g)} m/s²`],
    ['gole.pressione', `p ≤ (${it(K.pressBase)} + ${K.pressSpeed}·v_c)/(1 + v_c)`], ['gole.pressione', `${K.pressU}·cos(β/2)`], ['gole.pressione', `${it(K.pressV)}/sin(γ/2)`],
  ];
  for (const [id, text] of pairs) assert.ok(voce(id).valore.includes(text), `${id}: manca «${text}» in «${voce(id).valore}»`);
  // N_equiv(t) table: every point, as in the engine (UNI EN 81-50:2020, table 2)
  for (const [a, n] of [...K.neqU, ...K.neqV]) assert.ok(voce('funi.Nequiv.gola').valore.includes(`${a}° ${it(n, 1)}`), `manca ${a}° ${it(n, 1)}`);
});

test('profilo normativo italiano', () => {
  const sigle = PROFILO.documenti.map((d) => d.sigla).join(' | ');
  for (const doc of ['Direttiva 2014/33/UE', 'DPR 162/1999', 'UNI EN 81-20:2020', 'UNI EN 81-50:2020', 'UNI 10411-1:2024', 'UNI 10411-11:2024']) assert.ok(sigle.includes(doc), doc);
});
