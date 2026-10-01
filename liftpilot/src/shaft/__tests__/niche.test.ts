// Niches in the shaft walls: the counterweight runs in its niche and the car gains the niche's depth; the niches are
// checked (inside the wall with the wall left behind, off the door frames and each other, the counterweight inside its
// own); the plan goes round them and dimensions them; section A-A shows them where the cut crosses them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entity } from '../../drawing';
import { KV, PANEV_BACK, RAILS, defaultInputs, layout, planDims, planEntities, sectionEntities, type Niche, type ShaftInputs } from '../index';
import { innerFace } from '../plan-view';

const base = defaultInputs(1600, 1750);
const withNiches = (I: ShaftInputs, niches: Niche[]): ShaftInputs => ({ ...I, niches });
const check = (I: ShaftInputs) => layout(I).checks.find((c) => c.id === 'v_niche');

test('contrappeso sul fondo in nicchia: la cabina guadagna la profondità, il contrappeso e le guide stanno nella nicchia', () => {
  const plain = layout(base), n: Niche = { use: 'cw', wall: 'rear', at: 300, width: 1000, depth: 150 }, L = layout(withNiches(base, [n]));
  assert.equal(L.B - plain.B, n.depth, 'profondità guadagnata');
  assert.equal(L.cw.y + L.cw.h, base.D + n.depth - base.cwWallGap, 'distanza dal fondo della nicchia');
  // with Panev's supports (the default) each rail's foot keeps the room of the plate on the niche's back
  const keep = KV.cwShoe + RAILS[base.cwRail].h + PANEV_BACK;
  assert.ok(L.cw.x - KV.cwShoe - RAILS[base.cwRail].h >= n.at + KV.nicheGap - 1e-9 && L.cw.x + L.cw.w + KV.cwShoe + RAILS[base.cwRail].h <= n.at + n.width - KV.nicheGap + 1e-9);
  assert.equal(L.cw.w, n.width - 2 * keep);
  for (const r of L.rails.filter((x) => x.kind === 'cw')) assert.equal(r.bracketTo, base.D + n.depth, 'staffe sul fondo della nicchia');
  assert.equal(check(withNiches(base, [n]))?.status, 'ok');
  // the car never goes past the room the rear wall needs anyway
  const deep = layout(withNiches({ ...base, wall: 600 }, [{ ...n, depth: 500 }]));
  assert.equal(base.D - (deep.car.y + deep.car.h), base.rearGap);
});

test('contrappeso laterale e arcata a zaino in nicchia', () => {
  const side = layout(withNiches({ ...base, cw: 'left' }, [{ use: 'cw', wall: 'left', at: 400, width: 1000, depth: 120 }]));
  const plain = layout({ ...base, cw: 'left' });
  assert.equal(side.cw.x, plain.cw.x - 120);
  assert.ok(side.car.x < plain.car.x, 'la cabina si sposta verso la nicchia');
  assert.equal(side.checks.find((c) => c.id === 'v_niche')?.status, 'ok');
  const adj = { ...base, entrances: 'adjacent', side2: 'right', W: 1900, D: 1900 } as const;
  const z = layout(withNiches(adj, [{ use: 'cw', wall: 'left', at: 450, width: 1000, depth: 120 }])), z0 = layout(adj);
  assert.equal(z.cw.x, z0.cw.x - 120);
  assert.equal(z.checks.find((c) => c.id === 'v_niche')?.status, 'ok');
});

test('nicchie non conformi: troppo profonda, sul telaio della porta, sovrapposte, fuori dalla parete, contrappeso fuori', () => {
  const bad = (niches: Niche[]) => check(withNiches(base, niches));
  assert.equal(bad([{ use: 'duct', wall: 'left', at: 200, width: 200, depth: base.wall - KV.nicheBackMin + 1 }])?.status, 'fail');
  assert.equal(bad([{ use: 'duct', wall: 'front', at: 500, width: 200, depth: 100 }])?.status, 'fail');
  assert.equal(bad([{ use: 'duct', wall: 'left', at: 200, width: 200, depth: 100 }, { use: 'light', wall: 'left', at: 350, width: 300, depth: 100 }])?.status, 'fail');
  assert.equal(bad([{ use: 'light', wall: 'right', at: base.D - 100, width: 300, depth: 100 }])?.status, 'fail');
  assert.equal(bad([{ use: 'cw', wall: 'left', at: 200, width: 1000, depth: 100 }])?.status, 'fail', 'nicchia del contrappeso su un\'altra parete');
  assert.equal(bad([{ use: 'cw', wall: 'rear', at: 300, width: 1000, depth: 150 }])?.status, 'ok');
  assert.equal(check(base), undefined, 'senza nicchie nessuna verifica');
});

test('la pianta gira intorno alle nicchie e le quota; la sezione A-A le taglia', () => {
  const niches: Niche[] = [{ use: 'cw', wall: 'rear', at: 300, width: 1000, depth: 150 }, { use: 'duct', wall: 'right', at: 200, width: 200, depth: 100 },
    { use: 'light', wall: 'left', at: 1300, width: 300, depth: 100 }];
  const L = layout(withNiches(base, niches)), face = innerFace(L);
  // the rectangle's four corners plus four points for each niche running the whole height (the lamps' are dashed)
  assert.equal(face.length, 4 + 4 * 2);
  assert.ok(face.some(([x, y]) => x === 300 && y === base.D + 150) && face.some(([x, y]) => x === base.W + 100 && y === 400));
  const keys = planDims(L, 'main', L.inputs.vertical.main, { level: 'x' }).flatMap((e: Entity) => (e.e === 'chain' ? (e.c.edit ?? []).map((x) => x?.key) : []));
  for (const k of ['n.0.at', 'n.0.width', 'n.0.depth', 'n.1.at', 'n.2.depth']) assert.ok(keys.includes(k), k);
  assert.ok(planEntities(L, 'main', 0).some((e) => e.e === 'mark' && e.sym === 'light'), 'simbolo della luce');
  // the cut through the car's middle crosses the counterweight's niche: the rear wall is thinner all the way up
  const { entities, S } = sectionEntities(L, { carFloor: 0, lo: -2000, hi: 20000, zmap: null });
  const rear = entities.filter((e): e is Extract<Entity, { e: 'path' }> => e.e === 'path' && e.fill === 'concrete' && e.pts.every(([x, z]) => x >= base.D - 1 && z >= S.pitFloor - 1 && z <= S.ceiling + 1));
  assert.ok(rear.length > 0 && rear.every((e) => Math.min(...e.pts.map(([x]) => x)) >= base.D + 150 - 1e-9), 'muro posteriore dietro la nicchia');
});
