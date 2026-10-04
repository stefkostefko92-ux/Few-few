// The landing doors' own frame instead of the portal: the opening in the wall is its outside, the call station is
// measured from its edge, the plan and section A-A draw it with dimensions that change it, the form's schema bounds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chain, Entity } from '../../drawing';
import { shaftInputsSchema } from '../../lib/shaft-input';
import {
  FRAME_STD, KV, callStationAt, callStationOf, defaultInputs, editKeys, layout, marbleHeight, marbleOpening, marbleWidth, planDims, planEntities, portalOf,
  section, sectionDims, sectionEntities, valueOf, withValue, type ShaftInputs,
} from '../index';
import { detailWindow } from '../../lib/tavole/views';

const base = defaultInputs(1600, 1750), framed: ShaftInputs = { ...base, frame: FRAME_STD };
const chains = (es: Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));

test('telaio proprio: standard 120/220/50, il vano nel muro è il suo ingombro esterno; senza, il portale di sempre', () => {
  assert.deepEqual(FRAME_STD, { jamb: KV.frameStd[0], head: KV.frameStd[1], depth: KV.frameStd[2] });
  assert.deepEqual(portalOf(base), { jamb: KV.doorPortal, head: KV.doorHead, depth: null });
  assert.deepEqual(portalOf(framed), { jamb: 120, head: 220, depth: 50 });
  const d = layout(framed).doors[0], m = marbleOpening(framed, d);
  assert.equal(m.u1 - m.u0, framed.doorWidth + 240);
  assert.equal(m.h, framed.doorHeight + 220);
  assert.equal(marbleWidth(framed), framed.doorWidth + 240);
  assert.equal(marbleHeight(framed), framed.doorHeight + 220);
  // the call station from the frame's edge, in the plan where its dimension says
  const cs = callStationAt(d, callStationOf(framed), portalOf(framed).jamb), [w, , t] = KV.callPanel;
  assert.equal(cs.from, d.l1 + 120);
  assert.ok(planEntities(layout(framed), 'main', framed.vertical.main).some((e) => e.e === 'path' && e.fill === 'steel'
    && e.pts.some(([x, y]) => x === cs.u - w / 2 && y === -framed.wall - t)), 'bottoniera dal montante del telaio');
});

test('telaio proprio: in pianta i montanti e le quote che lo cambiano, in sezione il frontalino', () => {
  const L = layout(framed), main = framed.vertical.main;
  const plan = planEntities(L, 'main', main), dims = chains(planDims(L, 'main', main, { level: '' }));
  assert.ok(plan.length > planEntities(layout(base), 'main', main).length, 'i due montanti in pianta');
  const jambs = dims.find((c) => c.text?.[0] === 'Tel. {v}');
  assert.ok(jambs);
  assert.deepEqual(jambs.edit?.map((e) => e?.key), ['frame.jamb', 'doorWidth', 'frame.jamb']);
  assert.ok(dims.some((c) => c.text?.[0] === '{v} Vano telaio' && c.pts[1] - c.pts[0] === framed.doorWidth + 240));
  const S = section(L), sec = chains(sectionDims(L, S, 'floor', 1, null)), head = sec.find((c) => c.text?.[0] === 'Tel. 220');
  assert.ok(head);
  assert.equal(head.pts[1] - head.pts[0], 220);
  assert.equal(head.edit?.[0]?.key, 'frame.head');
  assert.ok(sec.some((c) => c.text?.[0] === `${framed.doorHeight + 220} H. vano telaio`));
  // the wall's opening in the section reaches the header's top
  assert.ok(sectionEntities(L, detailWindow(L, 'floor', 1)).entities.length > sectionEntities(layout(base), detailWindow(layout(base), 'floor', 1)).entities.length);
});

test('telaio proprio: le quote del disegno lo cambiano (dallo standard se non c’è), lo schema lo limita', () => {
  for (const k of ['frame.jamb', 'frame.head', 'frame.depth']) assert.ok(editKeys().includes(k), k);
  const J = withValue(base, 'frame.jamb', 150);
  assert.ok(J);
  assert.deepEqual(J.frame, { ...FRAME_STD, jamb: 150 });
  assert.equal(valueOf(J, 'frame.jamb'), 150);
  assert.equal(valueOf(base, 'frame.head'), null);
  assert.ok(shaftInputsSchema.safeParse(framed).success);
  assert.ok(!shaftInputsSchema.safeParse({ ...framed, frame: { ...FRAME_STD, jamb: KV.frameMin - 1 } }).success);
  assert.ok(!shaftInputsSchema.safeParse({ ...framed, frame: { ...FRAME_STD, color: 'grigio' } }).success);
});
