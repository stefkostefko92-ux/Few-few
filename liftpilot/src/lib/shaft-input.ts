// Validation of a shaft design coming from the browser: the inputs of the layout (plan, vertical data, machine room)
// and, when the dimensions were taken on a CAD drawing, the description of that measure. Millimetres as whole numbers;
// ranges wide enough for any lift and narrow enough to refuse nonsense. A design saved before the vertical data
// existed (engine 1) reads with the typical values of what it lacks.
import { z } from 'zod';
import { DEFAULTS, DEFAULT_VERTICAL, GOVERNORS, HEB_PROFILES, KV, KV_VERT, PROFILES, PROFILE_NAMES, RAIL_TYPES, SUPPORT_KINDS, hasProfile, profileOf, reasonText } from '@/shaft';
import { CW_CHOICES, DOOR_PAIRS } from '@/shaft/staffe-ids';

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
  carBufferType: z.enum(['spring', 'pu', 'oil']).optional(),
  cwBufferType: z.enum(['spring', 'pu', 'oil']).optional(),
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
  cwScreen: mm(300, 6000).optional(),
  standW: mm(100, 3000).optional(),
  standD: mm(100, 3000).optional(),
  unlockZone: mm(50, 350).optional(),
}).strict().superRefine((V, ctx) => {
  if (V.main >= V.floors.length) ctx.addIssue({ code: 'custom', path: ['main'], message: 'main floor out of range' });
  if (V.carOutH < V.carH) ctx.addIssue({ code: 'custom', path: ['carOutH'], message: 'outside height below inside height' });
});

const wall = z.enum(['front', 'rear', 'left', 'right']);

/** What the machine stands on (src/shaft/support.ts); each value absent is the typical one. */
const supportSchema = z.object({
  kind: z.enum(SUPPORT_KINDS),
  profile: z.enum(PROFILE_NAMES).optional(),
  height: mm(0, 3000).optional(),
  length: mm(300, 5000).optional(),
}).strict();

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
  // a pulley room's door may be as low as its registry minimum (locale.pulegge; a machine room's lower one fails m_door)
  doorH: mm(KV_VERT.pulleyDoorH, 3000),
  panelWall: wall,
  panelAt: mm(0, 20000),
  panelW: mm(200, 3000),
  panelD: mm(100, 1000),
  panelH: mm(500, 3000),
  support: supportSchema.optional(),
  /** HEB beams on the shaft's walls under the support (src/shaft/heb.ts); each value absent: the software's choice */
  heb: z.object({ profile: z.enum(HEB_PROFILES).optional(), dir: z.enum(['x', 'y']).optional() }).strict().optional(),
  /** the machine's motor toward the counterweight's drop or the car's (src/shaft/machine-room.ts); absent: the software's */
  motor: z.enum(['cw', 'car']).optional(),
}).strict();

/** The range the save accepts for each allowance [mm]: the form's fields take the same. */
export const ALLOWANCE_RANGE: Readonly<Record<keyof typeof DEFAULTS, readonly [number, number]>> = {
  landingDepth: [0, 500], sillGap: [0, 200], carDoorDepth: [0, 500], carWall: [0, 200], railZone: [0, 800], cwCarGap: [0, 500],
  cwDepth: [50, 600], cwWallGap: [0, 800], rearGap: [0, 800], shoeGap: [0, 300], cwRailGap: [0, 500],
};
/** The longest lining of a landing door the save accepts [mm]. */
export const IMBOTTI_MAX = 1500;
/** The largest jamb, header and depth of a landing door's own frame the form takes [mm]. */
export const FRAME_MAX = 600;
const allowance = <K extends keyof typeof DEFAULTS>(k: K) => mm(ALLOWANCE_RANGE[k][0], ALLOWANCE_RANGE[k][1]).default(DEFAULTS[k]);

/** Distances of the plan set by hand on the drawing (src/shaft/edit.ts); each one absent is worked out. */
export const planSchema = z.object({
  A: mm(300, 6000).optional(),
  B: mm(300, 6000).optional(),
  carX: mm(0, 10000).optional(),
  doorA: mm(0, 10000).optional(),
  doorB: mm(0, 10000).optional(),
  landA: mm(0, 10000).optional(),
  landB: mm(0, 10000).optional(),
  opLen: mm(300, 6000).optional(),
  railY: mm(0, 10000).optional(),
  dbg: mm(100, 10000).optional(),
  cwLen: mm(100, 3000).optional(),
  cwPos: mm(0, 10000).optional(),
  bufX: mm(0, 10000).optional(),
  bufY: mm(0, 10000).optional(),
  bufSpan: mm(100, 5000).optional(),
  cwBufPos: mm(0, 10000).optional(),
  govX: mm(0, 3000).optional(),
  govY: mm(0, 10000).optional(),
}).strict();

/** A niche in a wall of the shaft (src/shaft/niche.ts). */
export const nicheSchema = z.object({
  use: z.enum(['cw', 'light', 'duct']),
  wall,
  at: mm(0, 10000),
  width: mm(50, 5000),
  depth: mm(10, 1000),
}).strict();

/** The shaft as stored: what an earlier engine saved is read back even when today's form would refuse it (the running
 *  engine then says whether it reproduces the record). */
export const shaftInputsReadSchema = z.object({
  W: mm(500, 10000),
  D: mm(500, 10000),
  Q: z.number().int().min(100).max(10000).nullable(),
  door: z.enum(['T2', 'C2']),
  doorWidth: mm(500, 2500),
  doorHeight: mm(1800, 3000).default(2000),
  cw: z.enum(['rear', 'left', 'right']),
  access: z.enum(['none', 'dm236_existing', 'dm236_residential', 'dm236_public']),
  /** case c) of DM 236/1989 8.1.12: why the existing building takes no larger car (absent: not given) */
  accessReason: z.string().trim().min(1).max(300).optional(),
  entrances: z.enum(['one', 'opposite', 'adjacent']).default('one'),
  side2: z.enum(['left', 'right']).default('right'),
  carRail: z.enum(RAIL_TYPES).default('T70-1/A'),
  cwRail: z.enum(RAIL_TYPES).default('T45/A'),
  wall: mm(50, 1000).default(200),
  vertical: verticalSchema.default(DEFAULT_VERTICAL),
  room: roomSchema.nullable().default(null),
  landingDepth: allowance('landingDepth'),
  sillGap: allowance('sillGap'),
  carDoorDepth: allowance('carDoorDepth'),
  carWall: allowance('carWall'),
  railZone: allowance('railZone'),
  cwCarGap: allowance('cwCarGap'),
  cwDepth: allowance('cwDepth'),
  cwWallGap: allowance('cwWallGap'),
  rearGap: allowance('rearGap'),
  shoeGap: allowance('shoeGap'),
  cwRailGap: allowance('cwRailGap'),
  plan: planSchema.optional(),
  niches: z.array(nicheSchema).max(8).optional(),
  callStation: z.object({ side: z.enum(['left', 'right']), offset: mm(0, 2000), height: mm(600, 2000) }).strict().optional(),
  cwBrackets: z.enum(['panev', 'generic']).optional(),
  /** Panev's articles chosen by hand (src/shaft/staffe-ids.ts); absent: the software's choice */
  panev: z.object({ door: z.enum(DOOR_PAIRS).optional(), cw: z.enum(CW_CHOICES).optional() }).strict().optional(),
  doorMaker: z.enum(['generic', '2sg', 'fermator', 'dapa']).optional(),
  governor: z.string().refine((g) => GOVERNORS.some((x) => x.model === g)).optional(),
  /** the side wall the governor's rope runs by (src/shaft/governor.ts); absent: the software's */
  governorSide: z.enum(['left', 'right']).optional(),
  /** the walls at the top floor and in the headroom, in from the main floor's (src/shaft/head.ts) */
  head: z.object({ front: mm(-500, 500), rear: mm(-500, 500), left: mm(-500, 500), right: mm(-500, 500) }).strict().optional(),
  /** linings of the landing doors in an old opening between the marbles (src/shaft/imbotti.ts) */
  imbotti: z.object({ left: mm(0, IMBOTTI_MAX), right: mm(0, IMBOTTI_MAX), top: mm(0, IMBOTTI_MAX) }).strict().optional(),
  /** the landing doors' own frame (src/shaft/frame.ts): jambs, header and depth from KV.frameMin (the depth within the
   *  landing door's: check v_telaio) */
  frame: z.object({ jamb: mm(KV.frameMin, FRAME_MAX), head: mm(KV.frameMin, FRAME_MAX), depth: mm(KV.frameMin, FRAME_MAX) }).strict().optional(),
  /** the room of a machine below, sizes set on its drawings (lib/lift/bottom.ts belowRoom); each absent: the software's */
  below: z.object({ W: mm(1000, 20000).optional(), D: mm(1000, 20000).optional(), H: mm(1800, 10000).optional(), doorAt: mm(0, 20000).optional(),
    doorW: mm(500, 3000).optional(), doorH: mm(1500, 3000).optional() }).strict().optional(),
}).strict();

/** The shaft as the form saves it: the stored shape and the rules a new record must meet. */
export const shaftInputsSchema = shaftInputsReadSchema.superRefine((S, ctx) => {
  // case c)'s reason goes into the relazione as written: no hidden characters (src/shaft/reason.ts)
  if (S.accessReason !== undefined && reasonText(S.accessReason) !== S.accessReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessReason'], message: 'hidden characters' });
  }
  // the next stop above, a door's height up at least when both have a door on the same side (the doors of one wall do not
  // overlap), above it in any case
  const sides = (d: 'A' | 'B' | 'AB'): string[] => (d === 'AB' ? ['A', 'B'] : [d]), F = S.vertical.floors;
  F.forEach((f, i) => {
    const up = F[i + 1];
    if (!up) return;
    const min = sides(f.door).some((x) => sides(up.door).includes(x)) ? S.doorHeight : 1;
    if (f.rise < min) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: min, inclusive: true, type: 'number', path: ['vertical', 'floors', i, 'rise'], message: 'stops too close' });
  });
  supportAtLeastProfile(S.room?.support, ctx);
});

/** A rule of a new record (the full project's shaft, the replacement's survey): a frame or beams never lower than their
 *  profile, whose top their height is (raised beams higher) — a lower axis is another profile or the shims
 *  (src/shaft/support.ts). Stored records read without it. */
export function supportAtLeastProfile(sup: z.infer<typeof supportSchema> | undefined, ctx: z.RefinementCtx): void {
  if (!sup || !hasProfile(sup) || sup.height === undefined) return;
  const h = PROFILES[profileOf(sup)].h;
  if (sup.height < h) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: h, inclusive: true, type: 'number', path: ['room', 'support', 'height'], message: 'support below its profile' });
}

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
