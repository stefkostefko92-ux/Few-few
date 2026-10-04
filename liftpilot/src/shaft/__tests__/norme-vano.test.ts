// The shaft registry goes into the engineer's checklist and into the report: it must cover every constant, every
// default and every check, and its texts must say the numbers the layout uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COSTANTI_VERT, DEFAULTS, KV, KV_VERT, VOCI_VANO, VOCI_VERT, vociOfDesign } from '../index';
import type { Access, CostanteVano, CostanteVert, ShaftCheckId } from '../index';

const CHECKS: readonly ShaftCheckId[] = [
  'v_fit', 'v_area', 'v_acc_car', 'v_acc_door', 'v_acc_side', 'v_door', 'v_door2', 'v_op', 'v_wall', 'v_sill', 'v_cw', 'v_cwlen', 'v_place', 'v_doorcar', 'v_head',
  'h_refuge', 'h_clear', 'h_parapet', 'h_stand', 'h_door', 'h_staffe', 'h_car', 'h_cw', 'p_refuge', 'p_apron', 'p_screen', 'b_runby', 'b_type', 'b_car', 'b_cw', 'm_height', 'm_panel', 'm_door', 'm_beam', 'm_beamf', 'm_free',
  'gr_stress', 'gr_flange', 'gr_defl', 'sg_type',
];
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
  assert.ok(voce('porte.imbotti').valore.includes(`${KV.doorHead} mm di architrave`) && voce('porte.imbotti').valore.includes(`2 × ${KV.doorPortal} mm di portale`));
  for (const t of [`da ${KV.cwMinLength} a ${KV.cwMaxLength} mm`, `pattini ${KV.cwShoe} mm`, `a ${KV.cwEndGap} mm`]) assert.ok(voce('ingombri.contrappeso.laterale').valore.includes(t), t);
  for (const t of [`a ${KV.cantRailEnd} mm`, `a ${KV.cantCwGap} mm`, `a ${KV.cantClipGap} mm dalle bride`]) assert.ok(voce('ingombri.arcata.zaino').valore.includes(t), t);
  for (const t of [`${KV.doorPortal} mm`, `${it(KV.doorOpT2[0])}·L + ${KV.doorOpT2[1]} mm`, `${KV.doorOpC2[0]}·L + ${KV.doorOpC2[1]} mm`, `${KV.doorOpClose} mm oltre la luce`,
    `profondo ${KV.doorOpDepth} mm`, ...Object.values(KV.doorOpMakers).flatMap((m) => [`${it(m.T2[0])}·L + ${m.T2[1]} mm`, `${m.C2[0]}·L + ${m.C2[1]} mm`, `profondo ${m.depth} mm`])])
    assert.ok(voce('porte.operatore').valore.includes(t), t);
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

test('sezione, locale macchina e carichi: ogni costante ha la sua voce e la voce dice il numero', () => {
  const ids = new Set(VOCI_VERT.map((v) => v.id));
  for (const id of Object.keys(COSTANTI_VERT)) assert.ok(ids.has(id), `voce ${id}`);
  const mapped = new Set(Object.values(COSTANTI_VERT).flat());
  assert.deepEqual((Object.keys(KV_VERT) as CostanteVert[]).filter((c) => !mapped.has(c)), []);
  for (const [id, keys] of Object.entries(COSTANTI_VERT)) {
    const text = voce(id).valore;
    for (const k of keys) {
      const v = KV_VERT[k];
      const wanted = k === 'loadOffset' ? ['1/8'] : k === 'railBend' ? ['3·F·l/16']
        : k === 'omega370' ? KV_VERT.omega370.map(([, a, e, b]) => `${it(a)}·λ^${it(e)}${b ? ` + ${it(b)}` : ''}`) : k === 'refugeH' ? Object.values(KV_VERT.refugeH).map((h) => `alto ${h} mm`)
        : k === 'refugePlan' ? Object.values(KV_VERT.refugePlan).map(([w, d]) => `${w} × ${d} mm`)
          : k === 'standDrawn' ? [`${KV_VERT.standDrawn[0]} × ${KV_VERT.standDrawn[1]} mm`]
            : k === 'oilTypical' ? KV_VERT.oilTypical.flatMap(([h, st]) => [`alto ${it(h)} mm`, `corsa ${it(st)} mm`]) : [it(v as number)];
      for (const t of wanted) assert.ok(text.includes(t), `${id}: ${k} → «${t}»`);
    }
  }
  // the entries of the section are in the registry of the shaft, so in the checklist and in the report
  for (const v of VOCI_VERT) assert.ok(VOCI_VANO.includes(v), v.id);
});
