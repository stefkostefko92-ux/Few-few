// The shaft at the top floor and in the headroom of an old building: its walls where they stand there in the plan of
// the headroom, the dimensions that end on them move them, and the checks — the car and the counterweight clear of
// them, nothing standing inside them, the wall facing the entrance, Panev's supports reaching them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '../../drawing';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { KV, KV_VERT, applyEdit, defaultInputs, headBox, layout, planDims, valueOf, withValue } from '../index';
import { headRail } from '../head';
import { genericBracketPlan } from '../plan-staffe';
import { innerFace } from '../plan-view';
import type { HeadWalls, ShaftInputs } from '../index';

const base = defaultInputs(1600, 1750);
const withHead = (h: Partial<HeadWalls>, I: ShaftInputs = base): ShaftInputs => ({ ...I, head: { front: 0, rear: 0, left: 0, right: 0, ...h } });
const check = (I: ShaftInputs, id: string) => layout(I).checks.find((c) => c.id === id);
const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const top = base.vertical.floors.length - 1;

test('senza pareti proprie la testata è come il piano principale: nessuna verifica in più', () => {
  assert.equal(check(base, 'v_head'), undefined);
  assert.deepEqual(headBox(base), { x0: 0, x1: base.W, y0: 0, y1: base.D });
});

test('pianta in testata: le pareti dove stanno, il totale e le quote sulle pareti le spostano', () => {
  const I = withHead({ left: 40, right: 20, rear: -30 }), L = layout(I), face = innerFace(L, headBox(I));
  const xs = face.map((p) => p[0]), ys = face.map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [40, 1580, 0, 1780]);
  const cs = chains(planDims(L, 'top', top, { level: 'in Testata' }));
  const total = cs.find((c) => c.dir === 'x' && c.pts.length === 2 && c.text?.[0]?.includes('Vano'));
  assert.ok(total && total.pts[1] - total.pts[0] === 1540, 'larghezza in testata');
  assert.equal(total.edit?.[0]?.key, 'head.right');
  // the wall's own distance to the platform, moved by its edit
  const platform = cs.find((c) => c.dir === 'x' && c.text?.[1]?.includes('Piattaforma'));
  assert.ok(platform && platform.edit?.[0]?.key === 'head.left');
  const e = platform.edit?.[0];
  assert.ok(e);
  const next = applyEdit(I, e, platform.pts[1] - platform.pts[0] - 15);
  assert.equal(next && valueOf(next, 'head.left'), 55);
  // the main floor keeps its walls and its edits
  const main = chains(planDims(L, 'main', base.vertical.main, { level: 'x' })).find((c) => c.dir === 'x' && c.pts.length === 2 && c.text?.[0]?.includes('Vano'));
  assert.ok(main && main.pts[1] - main.pts[0] === 1600 && main.edit?.[0]?.key === 'W');
});

test('verifiche in testata: margine di marcia, pareti dentro guide e porte, parete di fronte all’entrata, staffe Panev', () => {
  const ok = check(withHead({ left: 40, right: 20, rear: -30 }), 'v_head');
  assert.ok(ok && ok.status === 'ok' && ok.limit === KV_VERT.headRun);
  // a side wall into the rails' feet: inside the wall
  const rails = check(withHead({ left: 100 }), 'v_head');
  assert.ok(rails && rails.status === 'fail' && (rails.value ?? 0) < 0, JSON.stringify(rails));
  // the front wall into the top floor's landing door
  assert.equal(check(withHead({ front: 10 }), 'v_head')?.status, 'fail');
  // the entrance wall further out: the car sill stands further from it than allowed
  const wall = check(withHead({ front: -50 }), 'v_wall');
  assert.ok(wall && wall.status === 'fail' && wall.value === base.landingDepth + base.sillGap + 50 && wall.limit === KV.wallFacingEntranceMax);
  // the rear wall in so far that no Panev support takes the rail there
  assert.equal(check(withHead({ rear: 120 }), 'v_staffa')?.status, 'fail');
  assert.equal(check(base, 'v_staffa')?.status, 'ok');
});

test('dati: pareti in testata nello schema, tolte quando tornano come al piano principale', () => {
  assert.ok(shaftInputsSchema.safeParse(withHead({ left: 40, rear: -30 })).success);
  assert.ok(!shaftInputsSchema.safeParse(withHead({ left: 600 })).success);
  const I = withValue(withHead({ left: 40 }), 'head.left', 0);
  assert.ok(I && I.head === undefined);
  assert.deepEqual(withValue(base, 'head.rear', -25)?.head, { front: 0, rear: -25, left: 0, right: 0 });
});

test('le staffe arrivano alla parete dove sta: al piano principale e in testata', () => {
  const I = withHead({ left: 40, right: -20 }), L = layout(I);
  const reach = (r: (typeof L.rails)[number]): readonly [number, number] => {
    const xs = genericBracketPlan(L, r).under.flatMap((e) => (e.e === 'path' && e.st !== 'hidden' ? e.pts.map((p) => p[0]) : []));
    return [Math.min(...xs), Math.max(...xs)];
  };
  const [left, right] = L.rails.filter((r) => r.kind === 'car');
  assert.ok(left && right);
  assert.ok(Math.abs(reach(left)[0]) < 0.5 && Math.abs(reach(right)[1] - I.W) < 0.5, 'piano principale');
  assert.ok(Math.abs(reach(headRail(I, left))[0] - 40) < 0.5 && Math.abs(reach(headRail(I, right))[1] - (I.W + 20)) < 0.5, 'testata');
});
