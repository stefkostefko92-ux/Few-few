// The control panel of a whole design (registry locale.quadro.posto): placed by the software for the machine the form
// derives, or entered; the records before the switch keep the panel where they had it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomGeo } from '@/shaft';
import { outlineGap, panelBox, type Wall } from '@/shaft/room-floor';
import { machineBox, machineParts } from '@/shaft/support-check';
import { defaultLift, deriveLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { liftInputsReadSchema, liftInputsSchema } from '@/lib/lift-input';
import { drawnShaft, movedPanel, panelEntered } from '@/lib/lift/panel-form';

const statusOf = (d: LiftDerived, id: string) => d.supportChecks.find((c) => c.id === id)?.status;

test('progetto completo: il quadro dove lo mette il software, fuori dall’argano, con le sue verifiche', () => {
  const base = defaultLift();
  assert.equal(base.auto.panel, true, 'a new design: the software places it');
  assert.ok(liftInputsSchema.safeParse(base).success);
  const d = deriveLift(base), R = d.shaft.room, G = roomGeo(d.layout, d.machine);
  assert.ok(R && G);
  assert.equal(d.origin.panel, 'auto');
  assert.ok(machineParts(G, d.machine).every((b) => outlineGap(panelBox(R), b) >= 0), 'clear of the machine and its bedplate');
  for (const id of ['m_panel', 'm_quadro', 'm_route', 'm_free']) assert.equal(statusOf(d, id), 'ok', id);
  // the drawings and the shaft's record take the design with the panel there
  assert.deepEqual([d.layout.inputs.room?.panelWall, d.layout.inputs.room?.panelAt], [R.panelWall, R.panelAt]);
});

test('quadro inserito dentro l’ingombro dell’argano: m_quadro e m_panel non passano', () => {
  const base = defaultLift(), d0 = deriveLift(base), R0 = d0.shaft.room, G = roomGeo(d0.layout, d0.machine);
  assert.ok(R0 && G);
  // on the wall nearest the machine, across it, 100 mm deeper than the machine is from that wall
  const box = machineBox(G, d0.machine), gaps: Record<Wall, number> = { front: box[1], rear: R0.D - box[3], left: box[0], right: R0.W - box[2] };
  const wall = (Object.keys(gaps) as Wall[]).sort((a, b) => gaps[a] - gaps[b])[0], along = wall === 'front' || wall === 'rear' ? box[0] : box[1];
  const room = { ...R0, panelWall: wall, panelAt: Math.round(along), panelW: 500, panelD: Math.ceil(gaps[wall]) + 100 };
  const inp: LiftInputs = { ...base, shaft: { ...base.shaft, room }, auto: { ...base.auto, panel: false } };
  const d = deriveLift(inp), q = d.supportChecks.find((c) => c.id === 'm_quadro');
  assert.equal(d.origin.panel, 'entered');
  assert.deepEqual([d.shaft.room?.panelWall, d.shaft.room?.panelAt], [wall, room.panelAt], 'where it was entered');
  assert.ok(q?.status === 'fail' && (q.value ?? 0) < 0, `m_quadro ${q?.value}`);
  assert.equal(statusOf(d, 'm_panel'), 'fail');
  // the software's place for the same design passes
  assert.equal(statusOf(deriveLift({ ...inp, auto: { ...inp.auto, panel: true } }), 'm_quadro'), 'ok');
});

test('i record di prima: senza la scelta il quadro resta dove era inserito', () => {
  const base = defaultLift(), auto = Object.fromEntries(Object.entries(base.auto).filter(([k]) => k !== 'panel')) as LiftInputs['auto'];
  const old: LiftInputs = { ...base, auto };
  assert.ok(liftInputsReadSchema.safeParse(old).success, 'read back');
  assert.ok(liftInputsSchema.safeParse(old).success, 'and saved again');
  const d = deriveLift(old);
  assert.equal(d.origin.panel, 'entered');
  assert.deepEqual([d.shaft.room?.panelWall, d.shaft.room?.panelAt], [base.shaft.room?.panelWall, base.shaft.room?.panelAt]);
});

test('il modulo: i disegni mostrano il quadro dove l’ha messo il software; spostato sul disegno, diventa inserito', () => {
  const base = defaultLift(), d = deriveLift(base), drawn = drawnShaft(base.shaft, d), R = drawn.room;
  assert.ok(R);
  assert.deepEqual([R.panelWall, R.panelAt], [d.shaft.room?.panelWall, d.shaft.room?.panelAt]);
  assert.equal(movedPanel(drawn, d), null, 'another dimension changed: the panel stays the software’s');
  const moved = movedPanel({ ...drawn, room: { ...R, panelAt: R.panelAt + 100 } }, d);
  assert.equal(moved?.panelAt, R.panelAt + 100);
  const f = panelEntered({ inputs: base, blank: ['room.panelWall', 'room.panelAt'] }, moved ?? R);
  assert.deepEqual([f.inputs.auto.panel, f.inputs.shaft.room?.panelAt, f.blank], [false, R.panelAt + 100, []]);
  // entered: drawn as entered, nothing to catch
  const off = deriveLift({ ...base, auto: { ...base.auto, panel: false } });
  assert.equal(drawnShaft(base.shaft, off), base.shaft);
  assert.equal(movedPanel({ ...drawn, room: { ...R, panelAt: R.panelAt + 100 } }, off), null);
});
