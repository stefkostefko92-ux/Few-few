// Installations of the round-37 fuzz the tests on the lettering of the sheets keep (each named by its seed): a new lift
// with the shaft, its floors, the machine room and the calculation's values the fuzz drew. What the drawings take only.
import { newLift, type AutoFlags, type LiftInputs } from '@/lib/lift';
import type { FormValues } from '@/calc/types';
import type { RoomInputs, ShaftInputs } from '@/shaft';

type Vertical = ShaftInputs['vertical'];

/** The floors with their rises from the lowest (the top's 0), named as given or by their index, each served on side A. */
const floors = (rises: readonly number[], labels?: readonly string[]): Vertical['floors'] =>
  rises.map((rise, i) => ({ label: labels?.[i] ?? String(i), rise, door: 'A' as const }));

function lift(shaft: Partial<ShaftInputs>, vertical: Partial<Vertical>, room: Partial<RoomInputs>, calc: FormValues = {}, auto: Partial<AutoFlags> = {}, rest: Pick<LiftInputs, 'catalog'> = {}): LiftInputs {
  const L = newLift(), S = L.shaft;
  return {
    ...L, ...rest, calc: { ...L.calc, ...calc }, auto: { ...L.auto, ...auto },
    shaft: { ...S, ...shaft, vertical: { ...S.vertical, ...vertical }, room: S.room ? { ...S.room, ...room } : null },
  };
}

/** Counterweight on the right, 300 mm walls, 2:1 with a SICOR SH160LS: the plans at 1:50, the car rails' bracket code
 *  longer than the side walls. */
export const s197 = (): LiftInputs => lift(
  { W: 2570, D: 1270, door: 'C2', doorWidth: 600, cw: 'right', access: 'none', wall: 300 },
  { v: 2.5, floors: floors([3150, 3100, 3650, 0]), main: 3, pit: 2110, headroom: 5090, carH: 2420, carOutH: 2580 },
  { W: 2970, D: 3770, shaftX: 0, shaftY: 1150, H: 2850, slab: 400, support: { kind: 'beams', profile: 'IPE 200' }, heb: {} },
  { P: 800, r: '2' }, { P: false, L0: false, panel: false }, { catalog: { brand: 'SICOR', model: 'SH160LS' } },
);

/** Counterweight on the left, 400 mm walls, six floors from "S1": the plans at 1:50. */
export const s206 = (): LiftInputs => lift(
  { W: 2280, D: 1300, Q: 225, doorWidth: 1100, cw: 'left', access: 'dm236_residential', side2: 'left', wall: 400 },
  { v: 1.6, floors: floors([3400, 3750, 4350, 3100, 4350, 0], ['S1', '1', '2', '3', '4', '5']), main: 4, pit: 2380, headroom: 3570, carH: 2010, carOutH: 2020, topRefuge: 1 },
  { W: 3680, D: 2250, shaftX: 450, shaftY: 150, H: 1850, slab: 400 },
  { layout: 'top' },
);

/** Counterweight at the rear, 300 mm walls, nine floors, the machine room with a diverting pulley. */
export const s37 = (): LiftInputs => lift(
  { W: 2580, D: 1440, Q: 400, doorWidth: 1000, access: 'dm236_residential', side2: 'left', wall: 300 },
  { v: 0.7, floors: floors([3100, 3100, 3500, 3000, 3650, 2750, 4350, 3200, 0]), main: 3, pit: 2040, headroom: 4120, carH: 2310, carOutH: 2500, pitRefuge: 2 },
  { W: 3780, H: 3150, support: { kind: 'rinvio' }, motor: 'cw' },
);

/** Counterweight at the rear, 300 mm walls, 2:1 with buffers. */
export const s182 = (): LiftInputs => lift(
  { W: 2430, D: 1330, Q: 1275, doorWidth: 700, side2: 'left', wall: 300 },
  { v: 2.5, floors: floors([3750, 2800, 0]), main: 2, pit: 1980, headroom: 3630, carH: 2410, carOutH: 2480 },
  { W: 3630, H: 2350, slab: 300 },
  { r: '2', buffers: true },
);

/** Counterweight on the right off the middle (910 mm), Panev's brackets for its rails, 300 mm walls. */
export const s221 = (): LiftInputs => lift(
  { W: 2460, D: 1270, Q: 480, doorWidth: 1100, cw: 'right', access: 'dm236_residential', side2: 'left', wall: 300, plan: { cwPos: 910 }, cwBrackets: 'panev' },
  { v: 1, floors: floors([4100, 3400, 4450, 2650, 3100, 2700, 0]), pit: 2190, headroom: 3860, carH: 2330, carOutH: 2420 },
  { W: 3660, H: 3200, slab: 200 },
);

/** Counterweight at the rear, fourteen floors, the ladder and the pit's control box near one corner: the plan of the
 *  pit at 1:25. */
export const s80 = (): LiftInputs => lift(
  { W: 2330, D: 1960, Q: 630, doorWidth: 850, access: 'dm236_residential', carRail: 'T114/B', cwRail: 'T82/B', governorSide: 'right' },
  { v: 1.6, floors: floors([4250, 3700, 3050, 3550, 2650, 3900, 2700, 3250, 2950, 3650, 3350, 3200, 4200, 0]), main: 3, pit: 1750, headroom: 4200, carH: 2290, carOutH: 2440, carBufferType: 'oil', cwBufferType: 'pu' },
  { W: 3180, D: 4060, shaftX: 400, shaftY: 1650, H: 2650, slab: 400 },
  { P: 1480 }, { P: false, machine: false, L0: false, dx: false, Hv: false, panel: false },
);
