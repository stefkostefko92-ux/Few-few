// Validation of a shaft design coming from the browser: the inputs of the layout (plan, vertical data, machine room)
// and, when the dimensions were taken on a CAD drawing, the description of that measure. Millimetres as whole numbers;
// ranges wide enough for any lift and narrow enough to refuse nonsense. A design saved before the vertical data
// existed (engine 1) reads with the typical values of what it lacks.
import { z } from 'zod';
import { DEFAULTS, DEFAULT_VERTICAL, GOVERNORS, RAIL_TYPES } from '@/shaft';

const mm = (min: number, max: number) => z.number().int().min(min).max(max);

const floorSchema = z.object({
  label: z.string().trim().min(1).max(8),
  rise: mm(0, 20000),
  door: z.enum(['A', 'B', 'AB']),
}).strict();

export const verticalSchema = z.object({
  v: z.number().finite().min(0.1).max(10),
  floors: z.array(floorSchema).min(2).max(60),
  main: z.number().int().min(0).max(59),
  pit: mm(100, 10000),
  headroom: mm(1000, 20000),
  carH: mm(1000, 5000),
  carOutH: mm(1000, 6000),
  platform: mm(0, 500),
  opTop: mm(0, 6000),
  frameTop: mm(1000, 8000),
  frameBelow: mm(0, 3000),
  parapet: mm(0, 2000),
  carBuffers: z.number().int().min(1).max(4),
  carBufferH: mm(50, 3000),
  carBufferStroke: mm(10, 2000),
  carBufferBase: mm(0, 3000),
  cwH: mm(300, 10000),
  cwBufferH: mm(50, 3000),
  cwBufferStroke: mm(10, 2000),
  cwBufferBase: mm(0, 3000),
  cwRunby: mm(0, 2000),
  topRefuge: z.union([z.literal(1), z.literal(2)]),
  pitRefuge: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict().superRefine((V, ctx) => {
  if (V.main >= V.floors.length) ctx.addIssue({ code: 'custom', path: ['main'], message: 'main floor out of range' });
  if (V.carOutH < V.carH) ctx.addIssue({ code: 'custom', path: ['carOutH'], message: 'outside height below inside height' });
});

const wall = z.enum(['front', 'rear', 'left', 'right']);

export const roomSchema = z.object({
  W: mm(1000, 20000),
  D: mm(1000, 20000),
  shaftX: mm(0, 20000),
  shaftY: mm(0, 20000),
  H: mm(1500, 10000),
  ridge: mm(0, 15000),
  slab: mm(100, 1000),
  doorWall: wall,
  doorAt: mm(0, 20000),
  doorW: mm(500, 3000),
  doorH: mm(1500, 3000),
  panelWall: wall,
  panelAt: mm(0, 20000),
  panelW: mm(200, 3000),
  panelD: mm(100, 1000),
  panelH: mm(500, 3000),
}).strict();

const allowance = <K extends keyof typeof DEFAULTS>(k: K, max: number) => mm(0, max).default(DEFAULTS[k]);

/** Distances of the plan set by hand on the drawing (src/shaft/edit.ts); each one absent is worked out. */
export const planSchema = z.object({
  A: mm(300, 6000).optional(),
  B: mm(300, 6000).optional(),
  carX: mm(0, 10000).optional(),
  doorA: mm(0, 10000).optional(),
  doorB: mm(0, 10000).optional(),
  opLen: mm(300, 6000).optional(),
  railY: mm(0, 10000).optional(),
  dbg: mm(100, 10000).optional(),
  cwLen: mm(100, 3000).optional(),
  cwPos: mm(0, 10000).optional(),
}).strict();

/** A niche in a wall of the shaft (src/shaft/niche.ts). */
export const nicheSchema = z.object({
  use: z.enum(['cw', 'light', 'duct']),
  wall,
  at: mm(0, 10000),
  width: mm(50, 5000),
  depth: mm(10, 1000),
}).strict();

export const shaftInputsSchema = z.object({
  W: mm(500, 10000),
  D: mm(500, 10000),
  Q: z.number().int().min(100).max(10000).nullable(),
  door: z.enum(['T2', 'C2']),
  doorWidth: mm(500, 2500),
  doorHeight: mm(1800, 3000).default(2000),
  cw: z.enum(['rear', 'left', 'right']),
  access: z.enum(['none', 'dm236_existing', 'dm236_residential', 'dm236_public']),
  entrances: z.enum(['one', 'opposite', 'adjacent']).default('one'),
  side2: z.enum(['left', 'right']).default('right'),
  carRail: z.enum(RAIL_TYPES).default('T70-1/A'),
  cwRail: z.enum(RAIL_TYPES).default('T45/A'),
  wall: mm(50, 1000).default(200),
  vertical: verticalSchema.default(DEFAULT_VERTICAL),
  room: roomSchema.nullable().default(null),
  landingDepth: allowance('landingDepth', 500),
  sillGap: allowance('sillGap', 200),
  carDoorDepth: allowance('carDoorDepth', 500),
  carWall: allowance('carWall', 200),
  railZone: allowance('railZone', 800),
  cwCarGap: allowance('cwCarGap', 500),
  cwDepth: mm(50, 600).default(DEFAULTS.cwDepth),
  cwWallGap: allowance('cwWallGap', 800),
  rearGap: allowance('rearGap', 800),
  shoeGap: allowance('shoeGap', 300),
  cwRailGap: allowance('cwRailGap', 500),
  plan: planSchema.optional(),
  niches: z.array(nicheSchema).max(8).optional(),
  callStation: z.object({ side: z.enum(['left', 'right']), offset: mm(0, 2000), height: mm(600, 2000) }).strict().optional(),
  cwBrackets: z.enum(['panev', 'generic']).optional(),
  doorMaker: z.enum(['generic', '2sg', 'fermator']).optional(),
  governor: z.string().refine((g) => GOVERNORS.some((x) => x.model === g)).optional(),
  /** the walls at the top floor and in the headroom, in from the main floor's (src/shaft/head.ts) */
  head: z.object({ front: mm(-500, 500), rear: mm(-500, 500), left: mm(-500, 500), right: mm(-500, 500) }).strict().optional(),
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
