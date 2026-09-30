// Validation of a shaft design coming from the browser: the inputs of the layout and, when the dimensions were taken
// on a CAD drawing, the description of that measure. Millimetres as whole numbers; ranges wide enough for any lift
// and narrow enough to refuse nonsense.
import { z } from 'zod';

const mm = (min: number, max: number) => z.number().int().min(min).max(max);

export const shaftInputsSchema = z.object({
  W: mm(500, 10000),
  D: mm(500, 10000),
  Q: z.number().int().min(100).max(10000).nullable(),
  door: z.enum(['T2', 'C2']),
  doorWidth: mm(500, 2500),
  cw: z.enum(['rear', 'left', 'right']),
  access: z.enum(['none', 'dm236_existing', 'dm236_residential', 'dm236_public']),
  landingDepth: mm(0, 500),
  sillGap: mm(0, 200),
  carDoorDepth: mm(0, 500),
  carWall: mm(0, 200),
  railZone: mm(0, 800),
  cwCarGap: mm(0, 500),
  cwDepth: mm(50, 600),
  cwWallGap: mm(0, 800),
  rearGap: mm(0, 800),
}).strict();

const finite = z.number().finite();
const positive = finite.positive().max(1e9);

/** The measure on the drawing: the file (by name and hash only), its units and the four rays from the point. */
export const shaftSourceSchema = z.object({
  file: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(['dxf', 'dwg']),
  version: z.string().max(20),
  units: z.enum(['mm', 'cm', 'dm', 'm', 'in', 'ft', 'unknown']),
  mmPerUnit: positive,
  point: z.tuple([finite, finite]),
  angle: finite.min(0).max(Math.PI / 2),
  rays: z.object({ right: positive, left: positive, up: positive, down: positive }).strict(),
  door: z.enum(['down', 'up', 'left', 'right']),
}).strict();

export type ShaftSource = z.infer<typeof shaftSourceSchema>;
