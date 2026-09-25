// .d.ts фасада (4a.2) за choreo-gen.js — allowJs резолвва самия .js за runtime, TS чете тук
// типовете. Пази извикващия код (roundsToChoreo.ts, тестове) strict без да изисква checkJs
// върху целия двигател (виж бележката в tsconfig.json).
export interface GenRound {
  attacker: 'hero' | 'foe';
  result: 'hit' | 'crit' | 'block' | 'dodge' | 'miss';
}

/** Формата, която timeline.js/director.js/choreo.js очакват — виж choreo.js GUARD_POSES/setChoreography. */
export interface GeneratedChoreography {
  A_KEYS: unknown[];
  B_KEYS: unknown[];
  B_SHIELD: unknown[];
  ROOT_KEYS: unknown[];
  A_ADV: unknown[];
  B_ADV: unknown[];
  B_KNEEL: unknown[];
  BREATH: unknown[];
  B_LOOK_DOWN: unknown[];
  TIME_SCALE: unknown[];
  EVENTS: unknown[];
  CAPTIONS: unknown[];
  CHAPTERS: unknown[];
  duration: number;
  shots: unknown[];
}

export interface BuildChoreographyOpts {
  rng?: () => number;
}

export function buildChoreography(
  rounds: GenRound[],
  victory: boolean,
  opts?: BuildChoreographyOpts,
): GeneratedChoreography;

export function mulberry32(seed: number): () => number;
