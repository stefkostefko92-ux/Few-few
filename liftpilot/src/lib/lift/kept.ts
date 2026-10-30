// The machine the intervention keeps (round 46, B8; registry locale.basamento.esistente). The condition is physical: a
// calculation of an existing installation ('repl') whose acceptance test keeps the machine (collaudo.ts partKept),
// whatever type the intervention is declared — the words of the sheets stay the declared type's (round 45, tavole/
// data.ts). The derivation reads the one form as the installation is: the machine on its existing base (the support
// 'esistente', src/shaft/room-kept.ts) where the calculation's L0 puts its sheave's axis, no HEB beams, and the rope
// beyond the travel and the diverting pulley's distance and height (L0, dx, h) the calculation's, never the drawing's;
// an axis the machine cannot have is the issue 'L0' (drawn.ts). The drawing depends on the hashed inputs only. Pure.
import type { FormValues } from '@/calc/types';
import { collaudoOf, partKept, type Collaudo } from './collaudo';
import type { LiftInputs } from './derive-types';

const num = (x: FormValues[string] | undefined): number => {
  const n = parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** The machine stays where it is: a calculation of an existing installation whose test keeps it. */
export const macchinaEsistente = (x: { calc: FormValues; collaudo?: Collaudo | null }): boolean =>
  x.calc.context === 'repl' && partKept(collaudoOf(x.calc, x.collaudo ?? undefined), 'machine');

/** The sheave's axis over the room's floor the calculation's L0 gives [mm]: L0 runs from the crosshead at the top floor
 *  to the sheave's axis (derive.ts ropeBeyond) — the headroom over the top floor and the slab less, the crosshead's
 *  height over the car's floor more. */
export function keptAxis(inp: Pick<LiftInputs, 'shaft' | 'calc'>): number {
  const vt = inp.shaft.vertical;
  return num(inp.calc.L0) * 1000 - vt.headroom + vt.frameTop - (inp.shaft.room?.slab ?? 0);
}

/** The inputs as the derivation takes them (deriveLift, first): the machine kept on its existing base with the axis from
 *  L0 (what it looks like as entered), without HEB beams, L0 and the pulley's dx and h from the calculation; any other
 *  calculation never stands on an existing base (a support 'esistente' sent with it is the software's own again). */
export function keptInputs(inp: LiftInputs): LiftInputs {
  const R = inp.shaft.room;
  if (!macchinaEsistente(inp)) {
    if (!R || R.support?.kind !== 'esistente') return inp;
    const { support: _s, ...room } = R;
    void _s;
    return { ...inp, shaft: { ...inp.shaft, room } };
  }
  const auto = { ...inp.auto, L0: false, dx: false };
  if (!R || inp.calc.layout === 'bottom') return { ...inp, auto };
  const { heb: _h, ...room } = R, of = R.support?.kind === 'esistente' ? R.support.of : undefined;
  void _h;
  return { ...inp, auto, shaft: { ...inp.shaft, room: { ...room, support: { kind: 'esistente', ...(of ? { of } : {}), axis: keptAxis(inp) } } } };
}
