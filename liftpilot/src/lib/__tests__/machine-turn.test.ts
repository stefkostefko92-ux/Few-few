// The machine in the room over the shaft lies along the rope drops, its sheave over the ropes and its motor toward the
// counterweight; when only turned round by 180° about the sheave's axis (the motor toward the car's drop) it stays
// inside the room with its support, the software turns it — the drawings, the checks, the support under it and the 3D
// with it — and the governor on the floor goes to the other free side when only there it stays clear of the machine.
// The orientation can be chosen by hand. Registry locale.ingombro, limitatore.posto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { drawnShaft, enteredShaft } from '@/lib/lift/panel-form';
import { deriveRoom } from '@/lib/room/derive';
import { startSurvey } from '@/lib/room/survey';
import { mergeChecks } from '@/shaft';
import { geoOn, machineU, machineV, planClear, roomGeo } from '@/shaft/machine-room';
import { governorFootprint } from '@/shaft/room-site';
import { machineParts } from '@/shaft/support-check';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const base = newLift(), room = base.shaft.room as Room;
// a direct pull on beams: the falls a Ø 770 sheave apart, the generic machine scaled to it — with its motor toward the
// counterweight it reaches into the rear wall of the 3 × 3 m room
const direct = (extra: Partial<Room> = {}, shaft: Partial<LiftInputs['shaft']> = {}): LiftInputs =>
  ({ ...base, calc: { ...base.calc, layout: 'top' }, shaft: { ...base.shaft, ...shaft, room: { ...room, support: { kind: 'beams', profile: 'IPE 240' }, ...extra } } });
const check = (inp: LiftInputs, id: string) => {
  const d = deriveLift(inp);
  return mergeChecks(d.layout.checks, d.supportChecks).find((c) => c.id === id);
};

test('argano girato: verso il contrappeso entra nel muro, girato di 180° sta nel locale', () => {
  const d = deriveLift(direct()), G = roomGeo(d.layout, d.machine);
  assert.ok(G);
  assert.equal(G.dir, -1, 'il software lo gira');
  assert.ok(planClear(G, d.machine) >= 0);
  const fit = check(direct(), 'm_fit');
  assert.ok(fit && fit.status === 'ok' && fit.value !== null && fit.value >= 0, JSON.stringify(fit));
  // chosen by hand toward the counterweight: it stays so, into the wall, and the check says by how much
  const cw = check(direct({ motor: 'cw' }), 'm_fit');
  assert.ok(cw && cw.status === 'fail' && cw.value !== null && cw.value < 0, JSON.stringify(cw));
  const dc = deriveLift(direct({ motor: 'cw' }));
  assert.equal(roomGeo(dc.layout, dc.machine)?.dir, 1);
  // chosen by hand toward the car: as the software turns it
  const dk = deriveLift(direct({ motor: 'car' }));
  assert.equal(roomGeo(dk.layout, dk.machine)?.dir, -1);
  // the default project fits as it always stood: not turned
  const d0 = deriveLift(base), G0 = roomGeo(d0.layout, d0.machine);
  assert.equal(G0?.dir, 1);
});

test('argano girato: lo stesso argano specchiato attorno alla puleggia, le calate e le funi dove erano', () => {
  const d = deriveLift(direct()), A = roomGeo(d.layout, d.machine);
  assert.ok(A);
  const P = { car: A.carDrop, cw: A.cwDrop, ux: A.ux, uy: A.uy, calata: A.calata };
  const one = geoOn(A.room, P, d.machine, A.sheaveAt, 1), turned = geoOn(A.room, P, d.machine, A.sheaveAt, -1);
  // along the drop line the frame mirrored about the sheave's centre, across it mirrored about the drop line
  assert.ok(Math.abs(turned.frame0 - (2 * A.sheaveAt - one.frame1)) < 1e-9 && Math.abs(turned.frame1 - (2 * A.sheaveAt - one.frame0)) < 1e-9);
  assert.ok(Math.abs(turned.across[0] + one.across[1]) < 1e-9 && Math.abs(turned.across[1] + one.across[0]) < 1e-9);
  // the sheave, the pulley and the drops do not move
  assert.equal(turned.sheaveAt, one.sheaveAt);
  assert.equal(turned.pulleyAt, one.pulleyAt);
  // a point of the machine: the motor's end (+X) toward the car's drop, the irons on the drop line's other side
  assert.ok(machineU(turned, 100) < turned.sheaveAt && machineU(one, 100) > one.sheaveAt);
  for (const z of A.frame.beams) assert.ok(Math.abs(machineV(turned, z) + machineV(one, z)) < 1e-9);
});

test('argano girato: il limitatore passa sull’altra parete libera, se solo lì resta fuori dall’argano', () => {
  const d = deriveLift(direct()), G = roomGeo(d.layout, d.machine);
  assert.ok(G);
  assert.equal(d.shaft.governorSide, 'left', 'sulla parete di destra l’argano girato gli starebbe sopra');
  const gov = governorFootprint(d.layout, G.room);
  assert.ok(gov);
  for (const [x0, y0, x1, y1] of machineParts(G, d.machine)) assert.ok(x1 <= gov[0] || gov[2] <= x0 || y1 <= gov[1] || gov[3] <= y0, 'limitatore fuori dall’argano');
  assert.equal(check(direct(), 'm_gov')?.status, 'ok');
  // a side chosen by hand stays (and the check says it is under the machine)
  const right = direct({}, { governorSide: 'right' });
  assert.equal(deriveLift(right).shaft.governorSide, 'right');
  assert.equal(check(right, 'm_gov')?.status, 'fail');
  // the governor placed by hand on the plan stays on its side too
  const byHand = deriveLift(direct({}, { plan: { govX: 70 } }));
  assert.equal(byHand.shaft.governorSide, undefined);
  // the default project keeps it where it always was
  assert.equal(deriveLift(base).shaft.governorSide, undefined);
});

test('argano girato: i disegni mostrano il limitatore dove il software l’ha messo, spostato lì diventa inserito', () => {
  const inp = direct(), d = deriveLift(inp), drawn = drawnShaft(inp.shaft, d);
  assert.equal(drawn.governorSide, 'left');
  // a change elsewhere on the drawings leaves the side to the software
  const other = enteredShaft({ ...drawn, W: drawn.W + 10 }, inp.shaft, d);
  assert.equal(other.governorSide, undefined);
  // the governor moved on the drawing: its side is entered with it
  const moved = enteredShaft({ ...drawn, plan: { ...drawn.plan, govX: 60 } }, inp.shaft, d);
  assert.equal(moved.governorSide, 'left');
});

test('sostituzione: l’argano nuovo girato quando solo così sta nel locale rilevato', () => {
  const V: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, s = startSurvey(780);
  // the rear wall brought in: with the motor toward the counterweight's drop the machine reaches into it
  const tight = { ...s, room: { ...s.room, D: 2300 } };
  const d = deriveRoom(V, tight);
  assert.equal(d.G?.dir, -1);
  const fit = d.checks.find((c) => c.id === 'm_fit');
  assert.ok(fit && fit.status === 'ok', JSON.stringify(fit));
  const cw = deriveRoom(V, { ...tight, room: { ...tight.room, motor: 'cw' } });
  assert.equal(cw.G?.dir, 1);
  assert.equal(cw.checks.find((c) => c.id === 'm_fit')?.status, 'fail');
  // the survey as it starts fits as it always stood
  assert.equal(deriveRoom(V, s).G?.dir, 1);
});

test('telaio con rinvio del costruttore: l’argano come lo monta il costruttore, girato solo a mano', () => {
  // SICOR SH140 on its bedplate XTE6026, the rear wall brought in until it reaches into it
  const L = { ...defaultLift(), catalog: { brand: 'SICOR' as const, model: 'SH140' } }, R0 = L.shaft.room as Room;
  const tight = (extra: Partial<Room> = {}): LiftInputs => ({ ...L, shaft: { ...L.shaft, room: { ...R0, D: 2250, ...extra } } });
  const d = deriveLift(tight()), G = roomGeo(d.layout, d.machine);
  assert.ok(d.machine.rinvio?.maker, 'telaio del costruttore');
  assert.ok(G && G.dir === 1, 'non lo gira il software');
  assert.equal(check(tight(), 'm_fit')?.status, 'fail');
  // turned by hand it is the engineer's (and the maker's) call
  const k = deriveLift(tight({ motor: 'car' }));
  assert.equal(roomGeo(k.layout, k.machine)?.dir, -1);
});
