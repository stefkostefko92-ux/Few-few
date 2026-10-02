// The machine room of a machine replacement as surveyed on site (src/lib/room): the room over the shaft (its size,
// height, slab, door, control panel and what the new machine stands on: room.ts), the shaft under it (inner size and
// walls) and where the existing ropes come up through the slab — the car's drop and the counterweight's, measured from
// the shaft's inner corner on the side of entrance A (x along that wall, y into the shaft). Millimetres as whole
// numbers; the browser's values are validated here as the save validates them.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import { roomSchema } from '@/lib/shaft-input';
import { DEFAULT_ROOM } from '@/shaft/room';

const mm = (min: number, max: number) => z.number().int().min(min).max(max);
const point = z.object({ x: mm(0, 10000), y: mm(0, 10000) }).strict();

export const surveySchema = z.object({
  room: roomSchema,
  shaft: z.object({ W: mm(500, 10000), D: mm(500, 10000), wall: mm(50, 1000) }).strict(),
  car: point,
  cw: point,
}).strict();

export type Survey = z.infer<typeof surveySchema>;

/** The survey a new machine room starts from: the room and the shaft of the software's example (to be replaced with the
 *  measures), the car's drop in the middle of the shaft and the counterweight's behind it at the calculation's spacing
 *  `calata` [mm] (its direct pull: the existing sheave; else the new one). */
export function startSurvey(calata: number): Survey {
  const W = 1600, D = 1750, carY = Math.round(Math.max(300, (D - calata) / 2));
  return {
    room: DEFAULT_ROOM, shaft: { W, D, wall: 200 },
    car: { x: W / 2, y: carY }, cw: { x: W / 2, y: Math.min(D - 100, Math.round(carY + calata)) },
  };
}

/** The spacing a calculation's values give the drops before any survey: what startSurvey needs [mm]. */
export const startCalata = (V: FormValues): number => {
  const n = (k: string, fb: number): number => (typeof V[k] === 'number' ? (V[k] as number) : Number.parseFloat(String(V[k] ?? '')) || fb);
  return V.layout === 'topDefl' ? n('n_D', 560) / 2 + n('dx', 0.3) * 1000 + n('Dp', 400) / 2 : n('n_D', 560);
};
