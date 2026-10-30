// The lifting hook over the machine (registry locale.gancio; UNI EN 81-20:2020, 5.2.1.7): fixed to the ceiling over the
// machine's centre of gravity — the middle of its outline in plan —, its rated load the heaviest piece lifted in the room
// (the machine with its bedframe, the maker's bedplate with the diverting pulley, in a replacement the existing machine
// too) rounded up to KV_VERT.hookStep and at least KV_VERT.hookMin, its eye KV_VERT.hookDrop under the ceiling. Room axes
// [mm, kg]; pure.
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';

export interface Hook {
  /** where it hangs in plan (room axes), and along and across the drop line from the car's drop */
  at: readonly [number, number];
  u: number;
  v: number;
  /** the heaviest piece it lifts and its rated load [kg] */
  piece: number;
  load: number;
  /** its eye over the room's floor [mm] (the ceiling's lowest point less KV_VERT.hookDrop) */
  eye: number;
}

/** The rated load for the heaviest piece [kg]. */
export const hookLoad = (piece: number): number => Math.max(KV_VERT.hookMin, Math.ceil(piece / KV_VERT.hookStep - 1e-9) * KV_VERT.hookStep);

/** The hook over the machine `M` in the room of `G`; `pieces`: the other pieces lifted there [kg] (a replacement's existing
 *  machine). */
export function hookOf(G: RoomGeo, M: MachineSpec, pieces: readonly number[] = []): Hook {
  const u = (G.frame0 + G.frame1) / 2, v = (G.across[0] + G.across[1]) / 2;
  const at: readonly [number, number] = [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];
  const bedplate = M.rinvio?.on === 'frame' ? M.rinvio.maker?.mass ?? 0 : 0, piece = Math.max(M.mass, bedplate, ...pieces);
  return { at, u, v, piece, load: hookLoad(piece), eye: G.room.H - KV_VERT.hookDrop };
}
