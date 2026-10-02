// The makers' bedplates that carry the machine with the diverting pulley under it (registry locale.rinvio): SICOR's,
// read in its "Geared" brochure of April 2026 (sicoritaly.com, 2 October 2026), drawing and tables "Bedplate | top
// machine with diverting pulley for CSW wrapping" of each model: the code by the pulley's diameter, the mass (bedplate,
// pulley and dampers), the heights over the room's floor (the pulley's axis, the sheave's axis A, the top of the beams
// A − B), how far the counterweight's rope drop may stand from the sheave's axis (L max = D/2 + that) and the size.
// SV110 and SH110B share the codes. MR12C's numbers do not close on its drawing; MR21's, MR26's and MR35's "short"
// bedplates put the pulley under the room's floor (Hmin = Dt/2 + 75), which the software never does: left out. Pure.
import type { MakerBedplate } from '@/shaft/rinvio';

interface Row {
  models: readonly string[];
  /** by pulley diameter (null: not stated): code, mass [kg], the sheave's axis over the floor [mm] */
  codes: readonly { code: string; dt: readonly number[] | null; mass: number; A: number }[];
  pulleyAxis: number;
  top: number;
  /** the sheave's axis to the counterweight's rope drop, at most [mm] */
  reach: number;
  length: number;
  width: number;
  page: number;
}

const ROWS: readonly Row[] = [
  { models: ['SV110'], codes: [{ code: 'XTE0517', dt: [400, 450], mass: 153, A: 994 }, { code: 'XTE0516', dt: [520], mass: 163, A: 1014 }], pulleyAxis: 320, top: 714, reach: 700, length: 1170, width: 655, page: 16 },
  { models: ['SH110B'], codes: [{ code: 'XTE0517', dt: [400, 450], mass: 153, A: 1012 }, { code: 'XTE0516', dt: [520], mass: 163, A: 1032 }], pulleyAxis: 320, top: 732, reach: 700, length: 1170, width: 655, page: 23 },
  { models: ['SH130', 'SH130G'], codes: [{ code: 'XTE3022', dt: [400, 450], mass: 138, A: 1016 }, { code: 'XTE3023', dt: [520], mass: 148, A: 1036 }], pulleyAxis: 320, top: 736, reach: 700, length: 1160, width: 655, page: 41 },
  { models: ['SH140'], codes: [{ code: 'XTE6026', dt: [400, 450], mass: 159, A: 1016 }, { code: 'XTE6027', dt: [520], mass: 176, A: 1036 }], pulleyAxis: 320, top: 736, reach: 700, length: 1170, width: 655, page: 58 },
  { models: ['SH160'], codes: [{ code: 'XTE5708', dt: [400, 450, 520], mass: 293, A: 1050 }], pulleyAxis: 301, top: 585, reach: 752, length: 1390, width: 920, page: 68 },
  { models: ['SH190'], codes: [{ code: 'XTE3988', dt: null, mass: 565, A: 1181 }], pulleyAxis: 355, top: 665, reach: 900, length: 1769, width: 939, page: 80 },
];

/** The maker's bedplate of the machine `brand model` for the sheave D and the diverting pulley Dp; null when the
 *  catalogue has none for that pulley (ours is drawn: rinvio.ts). */
export function makerBedplate(brand: string, model: string, D: number, Dp: number): MakerBedplate | null {
  if (brand !== 'SICOR') return null;
  const row = ROWS.find((r) => r.models.includes(model)), c = row?.codes.find((x) => x.dt === null || x.dt.includes(Dp));
  if (!row || !c) return null;
  return {
    brand, model, code: c.code, mass: c.mass, dt: c.dt, pulleyAxis: row.pulleyAxis, sheaveAxis: c.A, top: row.top,
    fall: { min: null, max: D / 2 + row.reach }, length: row.length, width: row.width,
    src: `D: brochure Geared SICOR 2026, p. ${row.page} (sicoritaly.com, 2 ottobre 2026)`,
  };
}

/** The models with a bedplate in the catalogue. */
export const BEDPLATE_MODELS: readonly string[] = ROWS.flatMap((r) => r.models);
