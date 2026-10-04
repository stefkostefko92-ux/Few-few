// The canonical record of the machine room of a replacement (RoomDesign): the version of the derivation, the hash of
// the calculation it builds on, the survey and what the derivation gives — the machine placed and its support, the
// drops, the checks, the load on the support. The verdict counts the checks the acceptance test takes in (the parts the
// intervention replaces, src/lib/lift/collaudo.ts); the others show their value as "esistente". Pure: the hash is taken
// on the server (src/lib/room-hash.ts).
import { canon, type Json } from '@/calc/snapshot';
import { ambitoOf, type Collaudo } from '@/lib/lift/collaudo';
import type { ShaftCheck } from '@/shaft/types';
import type { RoomDerived } from './derive';
import type { Survey } from './survey';

/** Version of the derivation of the room (semver): a change of rule or of a default is a minor or major version. */
export const ROOM_ENGINE_VERSION = '1.2.0';

export interface RoomSnapshot {
  engine: string;
  /** the SHA-256 of the calculation whose machine the room places */
  calc: string;
  inputs: Json;
  results: Json;
}

export function roomResults(d: RoomDerived): Json {
  const { M, G } = d, rf = M.rinvio ?? null;
  return canon({
    machine: d.made, issues: d.issues, calata: d.calata, hMin: d.hMin, load: d.load,
    spec: {
      D: M.D, Dp: M.Dp, n: M.n, d: M.d, mass: M.mass, axis: M.axis, h: M.h, reverse: M.reverse, ropeIn: M.ropeIn,
      rinvio: rf ? { on: rf.on, top: rf.top, pulleyAxis: rf.pulleyAxis, maker: rf.maker?.code ?? null } : null,
    },
    geo: G ? { carDrop: G.carDrop, cwDrop: G.cwDrop, sheaveAt: G.sheaveAt, pulleyAt: G.pulleyAt, pulleyZ: G.pulleyZ, frame: [G.frame0, G.frame1], across: G.across } : null,
    checks: d.checks.map((c) => ({ id: c.id, status: c.status, value: c.value, limit: c.limit })),
  });
}

export const roomSnapshot = (s: Survey, calcSha256: string, d: RoomDerived): RoomSnapshot =>
  ({ engine: ROOM_ENGINE_VERSION, calc: calcSha256, inputs: canon(s), results: roomResults(d) });

/** The checks the acceptance test `C` takes in, and their verdict. */
export function roomVerdict(checks: readonly ShaftCheck[], C: Collaudo): { verdict: 'OK' | 'WARN' | 'FAIL'; failCount: number; warnCount: number } {
  const counted = checks.filter((c) => ambitoOf(C, c.id) === 'applies');
  const failCount = counted.filter((c) => c.status === 'fail').length, warnCount = counted.filter((c) => c.status === 'warn').length;
  return { verdict: failCount ? 'FAIL' : warnCount ? 'WARN' : 'OK', failCount, warnCount };
}
