// The SICOR machines as they are (src/lib/catalog/shapes.ts, src/shaft/machine-shape.ts): every current model with a
// CAD model has its shape with the sheet's dimensions; our bedframe keeps the sheave's rim over its underside and its
// beams clear of the sheave and the ropes; nothing of the body crosses the sheave's rim; the generic machine keeps its
// numbers; a proposal from SICOR brings the shape into the drawings and the axis the calculation counts; the details
// the drawings and the 3D share (src/shaft/machine-detail.ts) sit where they belong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES } from '@/lib/catalog/machines';
import { SHAPES, shapeOf } from '@/lib/catalog/shapes';
import { defaultLift, deriveLift, KL, type LiftInputs } from '@/lib/lift';
import { KV_VERT, roomGeo, roomPlanEntities, roomSectionEntities } from '@/shaft';
import { MACHINE_A, MACHINE_X } from '@/shaft/machine-outline';
import { bodyBox, machineFrame, partBox, sheaveOf } from '@/shaft/machine-shape';
import { SPOKE_ANGLES, brakeOf, ribsOf, sheaveDims, spokeOutline } from '@/shaft/machine-detail';
import { ownAxis } from '@/shaft/support';
import { PRESETS } from '@/calc/presets';
import { buildReport } from '../report/build';

// as the sheets dimension them: the sheave's axis over the feet, P at the sheave D, the spacing of the outer holes along
// the worm and across, the feet's width, the holes, the overall height
const SHEET: readonly (readonly [string, number, number, number, number, number, number, string, number])[] = [
  ['MR12C', 172, 480, 197, 220, 180, 230, 'Ø22', 555],
  ['MR21', 475, 650, 290, 380, 330, 400, 'Ø24', 727],
  ['MR26', 540, 650, 330, 460, 350, 420, 'Ø24', 827],
  ['MR35', 685, 770, 275, 480, 660, 861, 'Ø28', 1062],
  ['SH110B', 162, 480, 187, 205, 150, 196, 'M20', 549],
  ['SH130', 166, 480, 192, 220, 180, 224, 'M20', 577],
  ['SH130G', 166, 520, 197, 220, 180, 224, 'M20', 584],
  ['SH140', 166, 480, 210, 220, 200, 246, 'M20', 584],
  ['SH160', 225, 600, 248.5, 235, 260, 316, 'M24', 733],
  ['SH190', 209, 650, 271, 380, 230, 362, 'M24', 732],
];

test('ogni argano SICOR con modello CAD ha la sua forma, con le quote della scheda', () => {
  assert.equal(SHAPES.length, SHEET.length);
  for (const [model, yWheel, D, P, hx, hz, w, hole, H] of SHEET) {
    const S = shapeOf('SICOR', model);
    assert.ok(S, model);
    assert.ok(MACHINES.some((c) => c.brand === 'SICOR' && c.model === model), `${model}: nel catalogo`);
    assert.equal(S.yWheel, yWheel, `${model}: asse della puleggia`);
    assert.equal(sheaveOf(S, D).P, P, `${model}: P`);
    const xs = S.holes.map((h) => h[0]), zs = S.holes.map((h) => h[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), hx, `${model}: fori lungo la vite`);
    assert.equal(Math.max(...zs) - Math.min(...zs), hz, `${model}: fori di traverso`);
    assert.equal(S.feet[3] - S.feet[1], w, `${model}: larghezza dei piedi`);
    assert.equal(S.hole, hole, model);
    for (const [x, z] of S.holes) assert.ok(x >= S.feet[0] && x <= S.feet[2] && z >= S.feet[1] && z <= S.feet[3], `${model}: foro nel piede`);
    // the body's height and its left end as the sheet gives them (the motor's length varies with the power)
    const b = bodyBox(S);
    assert.ok(Math.abs(b[4] - H) <= 25, `${model}: altezza ${b[4]} contro ${H}`);
    assert.ok(Math.abs(-b[0] - S.overall[0]) <= 15, `${model}: ingombro a sinistra ${-b[0]} contro ${S.overall[0]}`);
    // the sheet's sheaves are the catalogue's range
    const c = MACHINES.find((m) => m.brand === 'SICOR' && m.model === model), Ds = S.sheaves.map((r) => r[0]);
    assert.deepEqual(c?.sheaves, [Math.min(...Ds), Math.max(...Ds)], `${model}: pulegge`);
  }
  assert.equal(shapeOf('SICOR', 'SV110'), null, 'senza modello CAD: la macchina generica');
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
        const [x0, y0, pz0, x1, y1, pz1] = partBox(p);
        if (pz1 <= z0 || pz0 >= z1) continue;
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

const sicor = (model: string, support?: 'frame' | 'plinth'): LiftInputs => {
  const L = defaultLift();
  return { ...L, catalog: { brand: 'SICOR', model }, shaft: support && L.shaft.room ? { ...L.shaft, room: { ...L.shaft.room, support: { kind: support } } } : L.shaft };
};

test('proposta da SICOR: la forma nei disegni, l\'asse del suo telaio nel tratto di fune oltre la corsa', () => {
  for (const [model, support] of [['SH140', undefined], ['MR21', undefined], ['MR21', 'frame'], ['SH140', 'plinth']] as const) {
    const dv = deriveLift(sicor(model, support)), M = dv.machine, D = M.D, S = shapeOf('SICOR', model);
    assert.equal(dv.catalog?.fit?.machine.model, model, `${model}: presa dal catalogo`);
    assert.equal(M.shape, S, model);
    // on shims the software's axis, unless the machine on its bedframe needs it higher
    if (!support) assert.equal(M.axis, Math.max(KL.sheaveAxisPerD * D, machineFrame(D, S).axis), `${model}: asse`);
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
  // the generic machine when the proposal does not take a SICOR model
  assert.equal(deriveLift(defaultLift()).machine.shape ?? null, null);
});

test('relazione: le quote dell\'argano SICOR proposto, per il montaggio', () => {
  const doc = buildReport({
    calc: { id: 'cmtest0002', label: null, createdAt: new Date('2026-10-02T08:00:00Z'), sha256: 'e'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-02T09:00:00Z'), reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: true, catalog: { brand: 'SICOR', model: 'SH140', ratio: '1/45', staticKg: 3300, src: 'scheda' } },
  });
  const rows = new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
  assert.equal(rows.get('Fissaggio'), '4 × M20 su 220 × 200 mm; piedi 320 × 246 mm');
  assert.equal(rows.get('Assi sul piano dei piedi'), 'puleggia 166 mm, vite senza fine 300 mm');
});

test('dettagli disegnati come nel 3D: freno a tamburo intero, razze curve tra mozzo e corona, nervature dietro le fusioni', () => {
  for (const S of SHAPES) {
    const B = brakeOf(S);
    assert.ok(B, `${S.model}: freno`);
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
