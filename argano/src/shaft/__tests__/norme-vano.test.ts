// The shaft registry goes into the engineer's checklist and into the report: it must cover every constant, every
// default and every check, and its texts must say the numbers the layout uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, KV, VOCI_VANO, vociOfDesign } from '../index';
import type { Access, CostanteVano, ShaftCheckId } from '../index';

const CHECKS: readonly ShaftCheckId[] = ['v_fit', 'v_area', 'v_acc_car', 'v_acc_door', 'v_acc_side', 'v_door', 'v_wall', 'v_sill', 'v_cw', 'v_cwlen'];
const it = (x: number, dec?: number): string => (dec == null ? String(x) : x.toFixed(dec)).replace('.', ',');
const voce = (id: string) => {
  const v = VOCI_VANO.find((x) => x.id === id);
  assert.ok(v, `voce ${id}`);
  return v;
};

test('voci del vano complete e con identificativo unico', () => {
  const ids = VOCI_VANO.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const v of VOCI_VANO) for (const f of ['titolo', 'valore', 'riferimento', 'fonte'] as const) assert.ok(v[f].trim(), `${v.id}: ${f}`);
});

test('ogni costante e ogni verifica del vano hanno la loro voce', () => {
  const used = new Set(VOCI_VANO.flatMap((v) => v.costanti ?? []));
  assert.deepEqual((Object.keys(KV) as CostanteVano[]).filter((c) => !used.has(c)), []);
  const checked = new Set(VOCI_VANO.flatMap((v) => v.verifiche ?? []));
  assert.deepEqual(CHECKS.filter((c) => !checked.has(c)), []);
});

test('i testi riportano i numeri usati', () => {
  for (const [q, a] of KV.areaTable) assert.ok(voce('cabina.superficie').valore.includes(`${q} kg ${it(a, 2)}`) || voce('cabina.superficie').valore.includes(`${q} kg ${it(a, 2)} m²`), `${q} kg`);
  assert.ok(voce('cabina.superficie').valore.includes(`+${it(KV.areaPer100kgOver2500)} m² ogni 100 kg`));
  for (const [n, a] of KV.personsTable) assert.ok(voce('cabina.passeggeri').valore.includes(`${n} ${it(a, 2)}`) || voce('cabina.passeggeri').valore.includes(`${n} persona ${it(a, 2)}`), `${n} persone`);
  assert.ok(voce('cabina.passeggeri').valore.includes(`Q/${KV.personMass}`));
  assert.ok(voce('cabina.passeggeri').valore.includes(`+${it(KV.areaPerPersonOver20)} m²`));
  assert.ok(voce('distanze.parete.entrata').valore.includes(`≤ ${KV.wallFacingEntranceMax} mm`));
  assert.ok(voce('distanze.soglie').valore.includes(`≤ ${KV.sillGapMax} mm`));
  assert.ok(voce('distanze.contrappeso').valore.includes(`≥ ${KV.carCwMin} mm`));
  for (const [id, [w, d, p]] of [['accessibilita.residenziale', KV.dm236Residential], ['accessibilita.non.residenziale', KV.dm236Public], ['accessibilita.esistenti', KV.dm236Existing]] as const) {
    for (const t of [`larga ${w} mm`, `profonda ${d} mm`, `porta di ${p} mm`]) assert.ok(voce(id).valore.includes(t), `${id}: ${t}`);
  }
  assert.ok(voce('porte.ingombro').valore.includes(`${it(KV.doorStackT2)}·L + ${KV.doorFrame} mm`));
  assert.ok(voce('porte.ingombro').valore.includes(`${KV.doorStackC2}·L + ${KV.doorFrame} mm`));
  assert.ok(voce('porte.cabina').valore.includes(`+ ${KV.carDoorMargin} mm`) && voce('porte.cabina').valore.includes(`≥ ${KV.carMinDepth} mm`));
  for (const t of [`da ${KV.cwMinLength} a ${KV.cwMaxLength} mm`, `a ${KV.cwRailClear} mm`, `a ${KV.cwEndGap} mm`]) assert.ok(voce('ingombri.contrappeso.laterale').valore.includes(t), t);
  assert.ok(voce('modello.passo').valore.includes(`${KV.sizeStep} mm`));
  const typical = voce('ingombri.tipici').valore;
  for (const v of Object.values(DEFAULTS)) assert.ok(typical.includes(`${v} mm`), `${v} mm`);
});

test('voci di un progetto: solo il caso di accessibilità scelto', () => {
  const acc = (a: Access): string[] => vociOfDesign(a).filter((v) => v.gruppo === 'accessibilita').map((v) => v.id);
  assert.deepEqual(acc('none'), []);
  assert.deepEqual(acc('dm236_existing'), ['accessibilita.esistenti']);
  assert.deepEqual(acc('dm236_residential'), ['accessibilita.residenziale']);
  assert.deepEqual(acc('dm236_public'), ['accessibilita.non.residenziale']);
  assert.equal(vociOfDesign('none').length, VOCI_VANO.filter((v) => v.gruppo !== 'accessibilita').length);
});
