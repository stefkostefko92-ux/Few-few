// The makers' machines as they are (src/lib/catalog/shapes.ts, src/shaft/machine-shape.ts): every current SICOR model
// with a CAD model and every Montanari model with a dimensioned drawing has its shape with the sheet's dimensions; our
// bedframe keeps the sheave's rim over its underside and its beams clear of the sheave and the ropes; nothing of the body
// crosses the sheave's rim; the generic machine keeps its numbers; a proposal from SICOR or Montanari brings the shape
// into the drawings and the axis the calculation counts; the details the drawings and the 3D share
// (src/shaft/machine-detail.ts) sit where they belong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES } from '@/lib/catalog/machines';
import { SHAPES, shapeOf } from '@/lib/catalog/shapes';
import { defaultLift, deriveLift, type LiftInputs } from '@/lib/lift';
import { KV_VERT, roomGeo, roomPlanEntities, roomSectionEntities } from '@/shaft';
import { MACHINE_A, MACHINE_X } from '@/shaft/machine-outline';
import { bodyBox, machineFrame, partBox, sheaveOf } from '@/shaft/machine-shape';
import { SPOKE_ANGLES, brakeOf, ribsOf, sheaveDims, spokeOutline } from '@/shaft/machine-detail';
import { ownAxis } from '@/shaft/support';
import { PRESETS } from '@/calc/presets';
import { buildReport } from '../report/build';
import { shapeRows } from '../report/machine-shape';

// as the sheets dimension them: the sheave's axis over the feet, P at the sheave D, the spacing of the outer holes along
// the worm and across, the feet's width across (null: not dimensioned), the holes, the overall height
const SHEET: readonly (readonly [string, string, number, number, number, number, number, number | null, string, number])[] = [
  ['SICOR', 'MR12C', 172, 480, 197, 220, 180, 230, 'Ø22', 555],
  ['SICOR', 'MR21', 475, 650, 290, 380, 330, 400, 'Ø24', 727],
  ['SICOR', 'MR26', 540, 650, 330, 460, 350, 420, 'Ø24', 827],
  ['SICOR', 'MR35', 685, 770, 275, 480, 660, 861, 'Ø28', 1062],
  ['SICOR', 'SH110B', 162, 480, 187, 205, 150, 196, 'M20', 549],
  ['SICOR', 'SH130', 166, 480, 192, 220, 180, 224, 'M20', 577],
  ['SICOR', 'SH130G', 166, 520, 197, 220, 180, 224, 'M20', 584],
  ['SICOR', 'SH140', 166, 480, 210, 220, 200, 246, 'M20', 584],
  ['SICOR', 'SH160', 225, 600, 248.5, 235, 260, 316, 'M24', 733],
  ['SICOR', 'SH190', 209, 650, 271, 380, 230, 362, 'M24', 732],
  // Montanari: P = the row of holes + A; the S versions' holes and feet across reach their support's
  ['Montanari', 'M65', 150, 480, 190, 240, 220, 262, 'Ø21,5', 545],
  ...['M73', 'M73H', 'M75', 'M75H'].map((m) => ['Montanari', m, 150, 480, 215, 425, 220, null, 'Ø19,5', 546] as const),
  ...['M73S', 'M75S'].map((m) => ['Montanari', m, 150, 480, 215, 425, 420, null, 'Ø19,5', 546] as const),
  ['Montanari', 'M93', 200, 600, 265, 575, 300, 350, 'Ø24,5', 631],
  ['Montanari', 'M95', 200, 600, 280, 575, 563.5, 623.5, 'Ø24,5', 631],
  ['Montanari', 'M98', 230, 600, 300, 645, 610, 680, 'Ø25', 924],
  ['Montanari', 'M98H', 230, 600, 301, 645, 340, 400, 'Ø25', 924],
  // Sassi: the left-hand MODY, LEO, TORO; the holes and feet across of the MF94, MB94, MB95 reach their support's
  ['Sassi', 'MODY', 150, 480, 180, 205, 150, 230, 'M16', 651],
  ['Sassi', 'LEO', 135, 480, 185, 205, 150, 220, 'M16', 405],
  ['Sassi', 'TORO', 195, 480, 225, 240, 240, 290, 'M24', 650],
  ['Sassi', 'MF48', 170, 480, 220, 330, 230, 280, 'Ø25', 700],
  ['Sassi', 'MF84', 200, 600, 290, 400, 245, 300, 'M24', 820],
  ['Sassi', 'MF94', 260, 600, 310, 435, 610, 700, 'Ø25', 950],
  ['Sassi', 'MB94', 260, 600, 310, 435, 610, 700, 'Ø25', 985],
  ['Sassi', 'MB95', 315, 600, 420, 450, 830, null, 'Ø25', 1180],
  // SICOR SV110 (no CAD model): its sheet's drawing
  ['SICOR', 'SV110', 144, 520, 187, 205, 150, 200, 'M20', 591],
  // GEM: the Ø 600 with its own P; the L and CL versions' holes and feet across reach their support's
  ['GEM', 'HW134', 153, 480, 191, 224, 184, 230, 'Ø21', 552],
  ['GEM', 'HW134 Ø600', 153, 600, 200, 224, 184, 230, 'Ø21', 552],
  ['GEM', 'HW134L', 153, 550, 191, 224, 408, null, 'Ø21', 552],
  ['GEM', 'HW134L Ø600', 153, 600, 200, 224, 408, null, 'Ø21', 552],
  ['GEM', 'HW134VF', 153, 600, 200, 224, 184, 230, 'Ø21', 552],
  ['GEM', 'HW134VF con supporto', 153, 480, 191, 224, 408, null, 'Ø21', 552],
  ['GEM', 'HW135VF', 153, 480, 191, 224, 184, 230, 'Ø22', 562],
  ['GEM', 'HW135L-VF', 153, 550, 191, 224, 408, null, 'Ø22', 562],
  ['GEM', 'HW140C', 153, 560, 215, 224, 184, 230, 'Ø21', 590],
  ['GEM', 'HW140CL', 153, 600, 215, 224, 430, null, 'Ø21', 590],
  ['GEM', 'HW175', 200, 560, 265, 391, 260, 310, 'Ø25', 750],
  // FAER: the height measured in scale; the F versions' holes across reach their support's
  ['FAER', 'P58S', 348, 480, 215, 360, 270, null, 'Ø17', 520],
  ['FAER', 'P58F', 469, 480, 225, 360, 470, null, 'Ø17', 641],
  ['FAER', 'P60F', 469, 600, 225, 360, 470, null, 'Ø17', 641],
  ['FAER', 'P68F', 458, 600, 250, 420, 540, null, 'Ø20', 710],
  ['FAER', 'P70F', 497, 650, 250, 420, 540, null, 'Ø20', 730],
  ['FAER', 'P80F', 497, 550, 275, 420, 580, null, 'Ø20', 730],
];

test('ogni argano SICOR, Montanari, Sassi, GEM e FAER con disegno quotato ha la sua forma, con le quote della scheda', () => {
  assert.equal(SHAPES.length, SHEET.length);
  for (const [brand, model, yWheel, D, P, hx, hz, w, hole, H] of SHEET) {
    const S = shapeOf(brand, model);
    assert.ok(S, model);
    assert.ok(MACHINES.some((c) => c.brand === brand && c.model === model), `${model}: nel catalogo`);
    assert.equal(S.yWheel, yWheel, `${model}: asse della puleggia`);
    assert.equal(sheaveOf(S, D).P, P, `${model}: P`);
    const xs = S.holes.map((h) => h[0]), zs = S.holes.map((h) => h[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), hx, `${model}: fori lungo la vite`);
    assert.equal(Math.max(...zs) - Math.min(...zs), hz, `${model}: fori di traverso`);
    if (w !== null) assert.equal(S.feet[3] - S.feet[1], w, `${model}: larghezza dei piedi`);
    assert.equal(S.hole, hole, model);
    for (const [x, z] of S.holes) assert.ok(x >= S.feet[0] && x <= S.feet[2] && z >= S.feet[1] && z <= S.feet[3], `${model}: foro nel piede`);
    // the body's height and its left end as the sheet gives them (the motor's length varies with the power; the feet
    // may stand out of the gearbox)
    const b = bodyBox(S), left = Math.min(...S.parts.filter((p) => p.role !== 'base' && p.role !== 'pedestal').map((p) => partBox(p)[0]));
    assert.ok(Math.abs(b[4] - H) <= 25, `${model}: altezza ${b[4]} contro ${H}`);
    // to the body's end, or to the feet's where the sheet measures there (FAER's cast feet, angles and beams)
    assert.ok(Math.abs(-left - S.overall[0]) <= 15 || S.overall[0] === -S.feet[0], `${model}: ingombro a sinistra ${-left} contro ${S.overall[0]}`);
    // the sheet's sheaves are the catalogue's range
    const c = MACHINES.find((m) => m.brand === brand && m.model === model), Ds = S.sheaves.map((r) => r[0]);
    assert.deepEqual(c?.sheaves, [Math.min(...Ds), Math.max(...Ds)], `${model}: pulegge`);
  }
  // the SV110 stands vertical: its worm upright, measured in scale, and so said
  assert.ok(shapeOf('SICOR', 'SV110')?.wormX !== undefined && shapeOf('SICOR', 'SV110')?.wormScaled, 'SV110: vite verticale');
  for (const m of ['PENTA', 'M83', 'M73AL']) assert.equal(shapeOf('Montanari', m), null, `${m}: senza disegno quotato, la macchina generica`);
  assert.equal(shapeOf('Sassi', 'MB108'), null, 'MB108: i fori del piedistallo non si leggono, la macchina generica');
  // the M73 / M75 table: the sheave's width B and its mid-plane past the row of holes A by diameter
  const M73 = shapeOf('Montanari', 'M73');
  assert.ok(M73);
  assert.deepEqual([600, 650, 700].map((D) => sheaveOf(M73, D)), [{ P: 215, E: 115 }, { P: 230, E: 78 }, { P: 230, E: 87 }]);
});

test('telaio: il bordo della puleggia sopra il suo piano, le travi lontane da puleggia e funi, nulla del corpo nella corona', () => {
  for (const S of SHAPES) {
    for (const [D] of S.sheaves) {
      const F = machineFrame(D, S), R = D / 2, rIn = R - Math.max(32, 0.09 * R), z0 = F.zSheave - F.width / 2, z1 = F.zSheave + F.width / 2;
      assert.ok(F.bed >= KV_VERT.machineBed, `${S.model} Ø${D}: telaio ${F.bed}`);
      assert.ok(F.axis - R >= KV_VERT.machineRimClear - 1e-9, `${S.model} Ø${D}: bordo della puleggia ${F.axis - R}`);
      assert.ok(F.axis >= ownAxis(D) - 1e-9, `${S.model} Ø${D}: asse non sotto quello della macchina generica`);
      for (const zb of F.beams) assert.ok(zb + 35 < z0 || zb - 35 > z1, `${S.model} Ø${D}: trave del telaio a ${zb} sotto la puleggia`);
      for (const [a, b] of F.plinth) assert.ok(b <= z0 - 20 + 1e-9 || a >= z1 + 20 - 1e-9, `${S.model} Ø${D}: plinto sotto le funi`);
      for (const p of S.parts) {
        if (p.role === 'shaft') continue;
        const box = partBox(p), [x0, , pz0, x1, , pz1] = box;
        if (pz1 <= z0 || pz0 >= z1) continue;
        // a cylinder along X reaches into the sheave's band only with its chord there (a handwheel beside it)
        let [y0, y1] = [box[1], box[4]];
        if ('cyl' in p && p.cyl === 'x' && !p.tilt) {
          const [yc, zc] = p.at, zq = Math.min(Math.max(zc, z0), z1), hc = Math.sqrt(Math.max(0, p.r ** 2 - (zq - zc) ** 2));
          [y0, y1] = [yc - hc, yc + hc];
        }
        // the part's nearest and farthest points from the sheave's axis, in the sheave's plane
        const dx = Math.max(x0, Math.min(0, x1)), dy = Math.max(y0 - S.yWheel, Math.min(0, y1 - S.yWheel)), near = Math.hypot(dx, dy);
        const far = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x, y - S.yWheel)));
        assert.ok(far < rIn || near > R + 10, `${S.model} Ø${D}: ${p.role} nella corona della puleggia`);
      }
    }
  }
});

test('la macchina generica resta quella di sempre', () => {
  for (const D of [320, 480, 560, 650, 800]) {
    const F = machineFrame(D, null), s = D / (2000 * MACHINE_A.rp);
    assert.equal(F.axis, MACHINE_A.yWheel * 1000 * s);
    assert.equal(ownAxis(D), MACHINE_A.yWheel * 1000 * s);
    assert.deepEqual(F.x, [MACHINE_X[0] * 1000 * s, MACHINE_X[1] * 1000 * s]);
    assert.equal(F.shape, null);
  }
});

const maker = (brand: 'SICOR' | 'Montanari' | 'Sassi', model: string, support?: 'frame' | 'plinth'): LiftInputs => {
  const L = defaultLift();
  return { ...L, catalog: { brand, model }, shaft: support && L.shaft.room ? { ...L.shaft, room: { ...L.shaft.room, support: { kind: support } } } : L.shaft };
};
const sicor = (model: string, support?: 'frame' | 'plinth'): LiftInputs => maker('SICOR', model, support);

test('proposta da SICOR, Montanari o Sassi: la forma nei disegni, l\'asse del suo telaio nel tratto di fune oltre la corsa', () => {
  const cases = [['SICOR', 'SH140', undefined], ['SICOR', 'MR21', undefined], ['SICOR', 'MR21', 'frame'], ['SICOR', 'SH140', 'plinth'], ['Montanari', 'M93', undefined],
    ['Montanari', 'M98', 'frame'], ['Sassi', 'LEO', undefined], ['Sassi', 'MF84', 'frame']] as const;
  for (const [brand, model, support] of cases) {
    const dv = deriveLift(maker(brand, model, support)), M = dv.machine, D = M.D, S = shapeOf(brand, model);
    assert.equal(dv.catalog?.fit?.machine.model, model, `${model}: presa dal catalogo`);
    assert.equal(M.shape, S, model);
    // with the diverting pulley of the example and no support chosen, on the bedplate that holds it: SICOR's own for the
    // SH140 (XTE6026, A 1016 mm), ours for the others (its top and the machine on our bedframe)
    if (!support) assert.equal(M.axis, model === 'SH140' ? 1016 : (M.rinvio?.top ?? NaN) + machineFrame(D, S).axis, `${model}: asse sul telaio con rinvio`);
    const vt = dv.shaft.vertical, room = dv.shaft.room;
    assert.ok(room);
    assert.ok(Math.abs(Number(dv.values.L0) - Math.round(vt.headroom - vt.frameTop + room.slab + M.axis) / 1000) < 1e-9, `${model}: L0 con l'asse ${M.axis}`);
    // the drawings of the room draw it: the sheave with its rim in section, the bedframe from the room's floor
    const G = roomGeo(dv.layout, M);
    assert.ok(G && G.frame.shape === S);
    const sec = roomSectionEntities(dv.layout, M, G).entities, plan = roomPlanEntities(dv.layout, M, G).entities;
    assert.ok(sec.some((e) => e.e === 'circle' && Math.abs(e.r - (D / 2 + 6)) < 1e-9), `${model}: puleggia in sezione`);
    for (const e of [...sec, ...plan]) if (e.e === 'path') for (const p of e.pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), model);
  }
  // the generic machine when the proposal does not take a maker's model with a shape
  assert.equal(deriveLift(defaultLift()).machine.shape ?? null, null);
});

test('supporto esterno (Montanari S, SICOR MR35, Sassi MF94 MB94 MB95, GEM L e CL, FAER F): una trave sotto ogni fila di fori, l\'ingombro fino ai suoi piedi', () => {
  for (const [brand, model] of [['Montanari', 'M73S'], ['Montanari', 'M95'], ['Montanari', 'M98'], ['SICOR', 'MR35'], ['Sassi', 'MF94'], ['Sassi', 'MB94'], ['Sassi', 'MB95'],
    ['GEM', 'HW134L'], ['GEM', 'HW135L-VF'], ['GEM', 'HW140CL'], ['FAER', 'P58F'], ['FAER', 'P68F'], ['FAER', 'P80F']] as const) {
    const S = shapeOf(brand, model);
    assert.ok(S, model);
    const F = machineFrame(S.sheaves[0][0], S), rows = [...new Set(S.holes.map((h) => h[1]))].sort((a, b) => a - b);
    assert.deepEqual(F.beams, rows, `${model}: travi`);
    assert.equal(rows.length, 3, model);
    assert.equal(F.z[1], S.feet[3], `${model}: ingombro di traverso fino al supporto`);
  }
});

test('Sassi LEO e TORO: la vite inclinata di 15°; il volano del LEO 80 mm sotto i piedi, il nostro telaio finito prima', () => {
  for (const model of ['LEO', 'TORO']) {
    const S = shapeOf('Sassi', model), t = S?.parts.find((p) => p.tilt)?.tilt;
    assert.ok(S && t, model);
    assert.ok(Math.abs(t.a + Math.PI / 12) < 1e-12, `${model}: 15° verso il motore`);
    assert.equal(S.yWorm, t.at[1], `${model}: l'asse della vite dove esce dalla cassa`);
  }
  const S = shapeOf('Sassi', 'LEO'), fly = S?.parts.find((p) => p.role === 'handwheel');
  assert.ok(S && fly);
  assert.ok(Math.abs(bodyBox(S)[1] + 80) <= 2, `LEO: ${bodyBox(S)[1]} sotto il piano dei piedi (la scheda: 80)`);
  for (const [D] of S.sheaves) {
    const F = machineFrame(D, S);
    assert.ok(F.run[1] <= partBox(fly)[0] - 20 + 1e-9 && F.run[1] < F.x[1], `LEO Ø${D}: il telaio finisce prima del volano`);
    assert.ok(F.bed + bodyBox(S)[1] >= KV_VERT.machineRimClear - 1e-9, `LEO Ø${D}: il volano sopra il piano del telaio`);
  }
  // a machine with nothing under its feet keeps its bedframe end to end
  const M = shapeOf('Sassi', 'MF84');
  assert.ok(M);
  assert.deepEqual(machineFrame(600, M).run, machineFrame(600, M).x);
});

test('basamento SICOR con rinvio: le sue quote e il suo codice; un h a mano che sposta il rinvio prende il nostro, su misura', () => {
  const L = sicor('SH140'), auto = deriveLift(L), rf = auto.machine.rinvio;
  assert.equal(rf?.maker?.code, 'XTE6026');
  assert.equal(rf?.pulleyAxis, 320);
  assert.equal(Number(auto.values.h), 0.696, 'h = A − asse del rinvio (1016 − 320)');
  const byHand = (h: number) => deriveLift({ ...L, auto: { ...L.auto, dx: false }, calc: { ...L.calc, h } });
  const other = byHand(0.6);
  assert.equal(other.catalog?.fit?.machine.model, 'SH140');
  assert.equal(other.machine.rinvio?.on, 'frame');
  assert.equal(other.machine.rinvio?.maker ?? null, null, 'il basamento del costruttore tiene il rinvio alla sua quota');
  assert.equal(byHand(0.696).machine.rinvio?.maker?.code, 'XTE6026');
});

test('relazione: le quote dell\'argano SICOR, Montanari o Sassi proposto, per il montaggio', () => {
  const doc = buildReport({
    calc: { id: 'cmtest0002', label: null, createdAt: new Date('2026-10-02T08:00:00Z'), sha256: 'e'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-02T09:00:00Z'), reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: true, catalog: { brand: 'SICOR', model: 'SH140', ratio: '1/45', staticKg: 3300, src: 'scheda' } },
  });
  const rows = new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
  assert.equal(rows.get('Fissaggio'), '4 × M20 su 220 × 200 mm; piedi 320 × 246 mm');
  assert.equal(rows.get('Assi sul piano dei piedi'), 'puleggia 166 mm, vite senza fine 300 mm');
  // Montanari: the worm's axis is not dimensioned on its sheets, measured on the drawing in scale and said so
  const mt = buildReport({
    calc: { id: 'cmtest0003', label: null, createdAt: new Date('2026-10-03T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-03T09:00:00Z'), reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: true, catalog: { brand: 'Montanari', model: 'M93', ratio: '1/50', staticKg: 5000, src: 'scheda' } },
  });
  const mr = new Map(mt.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
  assert.equal(mr.get('Assi sul piano dei piedi'), 'puleggia 200 mm, vite senza fine ≈ 362 mm (misurato sul disegno in scala)');
  assert.equal(mr.get('Fissaggio'), '6 × Ø24,5 su 575 × 300 mm; piedi 644 × 350 mm');
  // Sassi LEO: the inclined worm and the flywheel under the feet's plane
  const leo = buildReport({
    calc: { id: 'cmtest0004', label: null, createdAt: new Date('2026-10-04T08:00:00Z'), sha256: 'a'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-04T09:00:00Z'), reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: true, catalog: { brand: 'Sassi', model: 'LEO', ratio: '1/55', staticKg: 3000, src: 'catalogo' } },
  });
  const lr = new Map(leo.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
  assert.equal(lr.get('Assi sul piano dei piedi'), 'puleggia 135 mm, vite senza fine ≈ 228 mm, inclinata di 15° (misurato sul disegno in scala)');
  assert.match(lr.get('Ingombri (scheda del costruttore)') ?? '', /altezza 405 mm sul piano dei piedi, fino a 80 mm sotto$/);
  // FAER: the height and the sheave's width read on the drawing in scale; GEM HW140CL: the body and E of the HW140C
  const rowsOf = (brand: string, model: string, D: number): Map<string, string> => {
    const S = shapeOf(brand, model);
    assert.ok(S, `${brand} ${model}`);
    return new Map(shapeRows(S, D, (x, dp = 0) => x.toFixed(dp)));
  };
  const p68 = rowsOf('FAER', 'P68F', 600), cl = rowsOf('GEM', 'HW140CL', 560);
  assert.match(p68.get('Puleggia') ?? '', /larghezza E ≈ 110 mm \(misurato sul disegno in scala\)$/);
  assert.match(p68.get('Ingombri (scheda del costruttore)') ?? '', /altezza ≈ 710 mm \(misurato sul disegno in scala\) sul piano dei piedi/);
  assert.match(cl.get('Puleggia') ?? '', /larghezza E = 100 mm \(come la HW140C\)$/);
  assert.ok(cl.has('Ingombri (scheda del costruttore; corpo come la HW140C)'));
});

test('dettagli disegnati come nel 3D: freno a tamburo intero, razze curve tra mozzo e corona, nervature dietro le fusioni', () => {
  // the drum brake whole where its levers are drawn: all but the Sassi MODY (its brake on the motor) and the inclined worms
  // (the SV110's on its upright worm)
  assert.deepEqual(SHAPES.filter((S) => !brakeOf(S)).map((S) => S.model), ['SV110', 'MODY', 'LEO', 'TORO']);
  for (const S of SHAPES) {
    const B = brakeOf(S);
    if (!B) continue;
    assert.deepEqual(B.levers.map((l) => l.side).sort(), [-1, 1], `${S.model}: due leve`);
    // the tie rod with the springs passes over the drum, through the levers' tops
    assert.ok(B.rodY > B.y + B.r, `${S.model}: tirante sopra il tamburo (${B.rodY} ≤ ${B.y + B.r})`);
    for (const L of B.levers) {
      assert.ok(L.z1 > L.z0 && L.z0 > 0, `${S.model}: leva`);
      const ys = L.outline.map((p) => p[1]);
      assert.ok(Math.min(...ys) <= L.pivot[1] && Math.max(...ys) >= B.rodY, `${S.model}: leva dal perno al tirante`);
    }
    for (const [D] of S.sheaves) {
      // from inside the hub into the rim, never past the grooves' bottom
      const { R, rh, rIn } = sheaveDims(D);
      for (const a of SPOKE_ANGLES) {
        const rs = spokeOutline(D, a).map((p) => Math.hypot(p[0], p[1]));
        assert.ok(Math.min(...rs) >= 0.6 * rh && Math.min(...rs) < rh && Math.max(...rs) > rIn && Math.max(...rs) < R - 6,
          `${S.model} Ø${D}: razza da ${Math.min(...rs).toFixed(1)} a ${Math.max(...rs).toFixed(1)}`);
      }
    }
  }
  assert.ok(SHAPES.some((S) => S.parts.some((p) => ribsOf(S, p))), 'nervature');
});
