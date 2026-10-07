// The 3D stands the machine in the room over the shaft as the drawings do: turned round when the drawings turn it (its
// motor toward the car's drop, machine-room.ts RoomGeo.dir), its bedframe along the drop line where the room's plan has
// it, the sheave where the rope rig hangs the ropes.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, ropeRig, type LiftInputs } from '@/lib/lift';
import { roomGeo } from '@/shaft/machine-room';
import { machinePose } from '../room';

type Room = NonNullable<LiftInputs['shaft']['room']>;

for (const motor of [undefined, 'cw', 'car'] as const) {
  test(`3D: l’argano come nei disegni (${motor ?? 'automatico'})`, () => {
    const base = newLift(), room = base.shaft.room as Room;
    const inp: LiftInputs = { ...base, calc: { ...base.calc, layout: 'top' },
      shaft: { ...base.shaft, room: { ...room, support: { kind: 'beams', profile: 'IPE 240' }, ...(motor ? { motor } : {}) } } };
    const dv = deriveLift(inp), G = roomGeo(dv.layout, dv.machine), rig = ropeRig(dv);
    assert.ok(G);
    assert.equal(G.dir, motor === 'cw' ? 1 : -1);
    const pose = machinePose(rig, dv.shaft.wall, dv.machine.n, dv.machine.d, G.frame, G.dir);
    // the worm along the drops' plane, toward the counterweight's drop or turned round toward the car's
    const along = pose.xDir[0] * rig.dir[0] + pose.xDir[1] * rig.dir[1];
    assert.ok(Math.abs(along - G.dir) < 1e-9, `${along}`);
    // the bedframe along the drop line where the room's plan draws it
    const ends = G.frame.x.map((x) => rig.sheave.u * 1000 + along * x).sort((a, b) => a - b);
    assert.ok(Math.abs(ends[0] - G.frame0) < 0.5 && Math.abs(ends[1] - G.frame1) < 0.5, `${ends} ≠ ${G.frame0}, ${G.frame1}`);
  });
}
