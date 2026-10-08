// The car rails' bracket where no catalogue's is chosen (registry guide.staffe.cabina; the plan's genericBracketPlan and
// the 3D's railfix.ts draw it): its type as the drawings name it, its count per rail, and how far each car rail's foot
// stands from the wall its bracket is anchored to. Pure.
import { bracketCount, railSpan } from './brackets';
import { KV_VERT } from './norme-vert';
import { RAILS, railClip } from './rails';
import { section } from './section';
import type { Layout, Rail, Wall } from './types';

/** The bracket's type: the angle, the wall plate with its anchors, the clips; two pieces past 150 mm from the wall. */
export function carBracketType(L: Layout): string {
  const K = KV_VERT, clip = railClip(L.inputs.carRail).bolt;
  return `SQUADRA ${K.carBracketLeg}×${K.carBracketFlange}×${K.carBracketT} SU PIASTRA ${K.carBracketPlateW}×${K.carBracketPlateH}×${K.carBracketPlateT}, `
    + `2 TASSELLI M${K.carBracketAnchor}, 2 GRAFFE M${clip}`;
}

/** The short type the plans write by the rail: count per rail, angle, anchors. */
export function carBracketCode(L: Layout): string {
  const K = KV_VERT, [z0, z1] = railSpan(section(L)), n = bracketCount(z1 - z0, L.carBracketPitch);
  return `${n}× SQUADRA ${K.carBracketLeg}×${K.carBracketFlange}×${K.carBracketT} + PIASTRA ${K.carBracketPlateW}×${K.carBracketPlateH}, 2 M${K.carBracketAnchor}`;
}

/** The wall a rail's bracket is anchored to and how far from it the rail stands [mm]: to the back of its foot when the
 *  wall is behind the foot (`to: 'foot'`), to its axis when the wall runs along the blade (`to: 'axis'`). */
export function bracketReach(L: Layout, r: Rail): { wall: Wall; reach: number; to: 'foot' | 'axis' } {
  const { W, D } = L.inputs, h = RAILS[r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail].h;
  const [dx, dy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
  const behind = r.bracketAxis === 'x' ? dx !== 0 : dy !== 0, foot = r.bracketAxis === 'x' ? r.x - dx * h : r.y - dy * h, far = r.bracketAxis === 'x' ? W : D;
  const wall: Wall = r.bracketAxis === 'x' ? (r.bracketTo > far / 2 ? 'right' : 'left') : r.bracketTo > far / 2 ? 'rear' : 'front';
  return { wall, reach: Math.round(Math.abs(r.bracketTo - foot)), to: behind ? 'foot' : 'axis' };
}

/** Past this reach the bracket comes in two pieces (registry guide.staffe.cabina) [mm]. */
export const twoPieces = (reach: number): boolean => reach > KV_VERT.carBracketOnePiece;
