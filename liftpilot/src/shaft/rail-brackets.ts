// The brackets of a design's rails, the one place whatever counts, places, labels or draws them takes them from
// (registry guide.staffe): every rail in the same lengths from the pit floor (the last never shorter than the longest
// fishplate of the design needs: brackets.ts lastPieceMin), each rail's brackets at its pitch clear of the joints'
// fishplates; a side counterweight's bridge at the counterweight rails' brackets — the car rail it carries takes the
// same heights, clear of its own fishplates too, at the closer of the two pitches; and which of them reach the walls
// where they stand in the headroom (from the top floor up: head.ts). Pure.
import { bracketHeights, bracketSpans, lastPieceMin, railPieces, railSpan } from './brackets';
import { hasHead } from './head';
import { KV_VERT } from './norme-vert';
import type { RailType } from './rails';
import { section } from './section';
import type { Layout, Rail } from './types';

const typesOf = (L: Layout): RailType[] => [L.inputs.carRail, L.inputs.cwRail];
const pitchOf = (L: Layout, kind: Rail['kind']): number => (kind === 'car' ? L.carBracketPitch : L.cwBracketPitch) ?? KV_VERT.bracketPitch;

/** The lengths every rail of the design is made of and its joints [mm] (railPieces from the pit floor to under the slab). */
export function designPieces(L: Layout): { pieces: number[]; joints: number[] } {
  const [z0, z1] = railSpan(section(L));
  return railPieces(z0, z1, lastPieceMin(typesOf(L)));
}

/** The car rail a side counterweight's bridge carries: its bracket reaches the bridge, short of the walls. */
export const onBridge = (L: Layout, r: Rail): boolean =>
  L.bridge !== null && r.kind === 'car' && r.bracketTo > 0 && r.bracketTo < (r.bracketAxis === 'x' ? L.inputs.W : L.inputs.D);

/** The heights of a side counterweight's bridge [mm] (none without one): one at each bracket of the counterweight
 *  rails, at the closer of the car's and the counterweight's pitches, clear of the fishplates of both rails. */
export function bridgeHeights(L: Layout): number[] {
  if (!L.bridge) return [];
  const [z0, z1] = railSpan(section(L));
  return bracketHeights(z0, z1, typesOf(L), Math.min(pitchOf(L, 'car'), pitchOf(L, 'cw')), designPieces(L).joints);
}

/** The heights of the brackets of a rail of the design [mm]: its own, or the bridge's for the counterweight rails and
 *  the car rail of a side counterweight. */
export function railHeights(L: Layout, r: Rail): number[] {
  if (L.bridge && (r.kind === 'cw' || onBridge(L, r))) return bridgeHeights(L);
  const [z0, z1] = railSpan(section(L)), type = r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail;
  return bracketHeights(z0, z1, type, pitchOf(L, r.kind), designPieces(L).joints);
}

/** From this height up the brackets reach the walls where they stand in the headroom: the top floor's [mm]; none
 *  (Infinity) when the walls stand there as at the main floor. */
export function headFrom(L: Layout): number {
  const I = L.inputs;
  return hasHead(I) ? section(L).levels[I.vertical.floors.length - 1] ?? Infinity : Infinity;
}

/** The heights of a rail's brackets that reach the walls of a plan: the headroom's (`head`) from the top floor up, the
 *  main floor's under it; when the walls stand everywhere as at the main floor, every bracket at both. */
export function levelHeights(L: Layout, r: Rail, head: boolean): number[] {
  const hs = railHeights(L, r), z = headFrom(L);
  return z === Infinity ? hs : hs.filter((h) => h >= z === head);
}

/** The longest interval between two brackets of the rails of a kind [mm]: the l of the car rails' check (UNI EN
 *  81-50:2020, 5.10) and the figure sheet 1 prints; 0 with fewer than two. */
export const maxSpanOf = (L: Layout, kind: Rail['kind']): number =>
  Math.max(0, ...L.rails.filter((r) => r.kind === kind).flatMap((r) => bracketSpans(railHeights(L, r))));

/** The car rail anchored to a wall the sheets show (a side counterweight's bridge carries the other). */
export const wallCarRail = (L: Layout): Rail | undefined =>
  L.rails.find((r) => r.kind === 'car' && !onBridge(L, r)) ?? L.rails.find((r) => r.kind === 'car');
