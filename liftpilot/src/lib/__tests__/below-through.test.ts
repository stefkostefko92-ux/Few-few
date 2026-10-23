// The machine below beside the shaft, its sheave through the wall on a longer slow shaft (bottom.ts throughExt): every
// maker's machine stands whole in the room — nothing of it but the slow shaft in its sleeve lies in the wall, in plan
// and in section C-C; its sheave, between the runs in the gap behind the counterweight, as clear of the wall as the
// rope pack even when it is wider — and the plan and the section show the sheave at the same place and as wide; the
// wall's opening is dimensioned in plan (a reference). Until LIFT 1.28.0 the plan moved what reached past the gearbox's face across the
// wall with the sheave (the brake's arms, the handwheel, a base under the sheave) and the 3D left them in the wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entity, Pt } from '@/drawing';
import { SHAPES } from '@/lib/catalog/shapes';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { belowMachine, bodyReach, bottomGeo, sheaveHalfBelow, throughExt, type BottomScheme } from '@/lib/lift/bottom';
import { sheaveAxisBelow } from '@/lib/lift/machine';
import { belowMachinePlan, belowSectionEntities } from '@/lib/tavole/below-view';
import { partBox, sheaveOf } from '@/shaft/machine-shape';

const below = (scheme: BottomScheme): LiftInputs => {
  const b = newLift();
  return { ...b, calc: { ...b.calc, layout: 'bottom' }, bottom: scheme };
};

/** Each catalogue machine on the default installation's machine below `scheme`, at the sheave in its table nearest
 *  the proposal's. */
function cases(scheme: BottomScheme) {
  const d = deriveLift(below(scheme)), L = d.layout, M0 = d.machine, I = d.analysis.ctx.I;
  return SHAPES.map((S) => {
    const D = S.sheaves.reduce((a, r) => (Math.abs(r[0] - M0.D) < Math.abs(a - M0.D) ? r[0] : a), S.sheaves[0][0]);
    const M = { ...M0, D, shape: S, label: `${S.brand} ${S.model}` };
    const g = bottomGeo(L, scheme, D, I.Dp, M.n, M.d, I.r, sheaveAxisBelow(D, S), sheaveHalfBelow(D, M.n, M.d, S));
    return { L, M, g, name: `${S.brand} ${S.model} Ø ${D}` };
  });
}

const ptsOf = (e: Entity): Pt[] => (e.e === 'path' ? [...e.pts] : e.e === 'circle' ? [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]] : e.e === 'line' ? [e.a, e.b] : []);

test('macchina in basso accanto al vano: ogni macchina del catalogo tutta nel locale, nel muro solo l’albero nel suo manicotto', () => {
  for (const { L, M, g, name } of cases('head')) {
    const T = L.inputs.wall, w0 = g.wallAt, w1 = g.wallAt + T, along = (p: Pt): number => (p[0] - g.car[0]) * g.dir[0] + (p[1] - g.car[1]) * g.dir[1];
    const { entities, through } = belowMachinePlan(L, M, g);
    assert.ok(through.length >= 3, `${name}: manicotto, albero e quota del foro`);
    assert.ok(through.some((e) => e.e === 'chain' && e.c.text?.[0]?.startsWith('Foro') && !e.c.edit), `${name}: il foro quotato, un riferimento`);
    for (const e of entities.filter((x) => !through.includes(x))) {
      const us = ptsOf(e).map(along);
      if (!us.length) continue;
      const lo = Math.min(...us), hi = Math.max(...us);
      assert.ok(hi <= w0 + 0.5 || lo >= w1 - 0.5, `${name}: ${e.e} ${lo.toFixed(0)}..${hi.toFixed(0)} nel muro ${w0.toFixed(0)}..${w1.toFixed(0)}`);
    }
    // the body 50 mm clear of the wall, as the 3D stands it (throughExt): the same reach in the model
    const m = belowMachine(L, g, M.D, M.shape);
    assert.equal(m.ext, throughExt(m.F, g, T));
    const near = along([m.C[0], m.C[1]]) + m.F.zSheave + m.ext - bodyReach(m.F);
    assert.ok(m.ext > 0 && Math.abs(near - (w1 + 50)) < 1e-6, `${name}: il corpo a 50 mm dal muro (${(near - w1).toFixed(1)})`);
    for (const p of M.shape?.parts ?? []) assert.ok(partBox(p)[5] <= bodyReach(m.F) + 1e-9, `${name}: ${p.role} oltre la portata del corpo`);
  }
});

test('macchina in basso accanto al vano: la puleggia di trazione nella stessa posizione e larga uguale in pianta e nella sezione C-C', () => {
  for (const { L, M, g, name } of cases('head')) {
    const along = (p: Pt): number => (p[0] - g.car[0]) * g.dir[0] + (p[1] - g.car[1]) * g.dir[1];
    const { xDir } = belowMachine(L, g, M.D, M.shape);
    const across = (p: Pt): number => p[0] * xDir[0] + p[1] * xDir[1];
    // in plan: the steel quad as long as the sheave's rim along the worm
    const plan = belowMachinePlan(L, M, g).entities.find((e) => e.e === 'path' && e.st === 'outline' && e.fill === 'steel' && e.pts.length === 4
      && Math.abs(Math.max(...e.pts.map(across)) - Math.min(...e.pts.map(across)) - (M.D + 12)) < 0.5);
    assert.ok(plan && plan.e === 'path', `${name}: la puleggia in pianta`);
    const pu = plan.pts.map(along);
    // in section C-C: the steel box as high as the sheave
    const sec = belowSectionEntities(L, M, g).entities.find((e) => e.e === 'path' && e.st === 'outline' && e.fill === 'steel'
      && Math.abs(Math.max(...e.pts.map((p) => p[1])) - Math.min(...e.pts.map((p) => p[1])) - M.D) < 0.5);
    assert.ok(sec && sec.e === 'path', `${name}: la puleggia nella sezione`);
    const su = sec.pts.map((p) => p[0]);
    assert.ok(Math.abs(Math.min(...pu) - Math.min(...su)) < 0.5 && Math.abs(Math.max(...pu) - Math.max(...su)) < 0.5,
      `${name}: pianta ${Math.min(...pu).toFixed(0)}..${Math.max(...pu).toFixed(0)}, sezione ${Math.min(...su).toFixed(0)}..${Math.max(...su).toFixed(0)}`);
    assert.ok(sheaveOf(M.shape, M.D).E <= Math.max(...pu) - Math.min(...pu) + 1e-9, `${name}: almeno la larghezza E`);
  }
});

test('macchina in basso, sezione C-C: nessuna parte della macchina nel muro, solo l’albero nel foro', () => {
  for (const { L, M, g, name } of cases('room')) {
    const T = L.inputs.wall, w0 = g.wallAt, w1 = g.wallAt + T;
    for (const e of belowSectionEntities(L, M, g).entities) {
      if (e.e !== 'path' || e.st !== 'outline') continue;
      const us = e.pts.map((p) => p[0]), lo = Math.min(...us), hi = Math.max(...us);
      assert.ok(hi <= w0 + 0.5 || lo >= w1 - 0.5, `${name}: ${lo.toFixed(0)}..${hi.toFixed(0)} nel muro ${w0.toFixed(0)}..${w1.toFixed(0)}`);
    }
  }
});
