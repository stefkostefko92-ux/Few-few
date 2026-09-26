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
  /** 4a.4 (кръг 2): кита на всеки слот (debug/удобство — виж loadout.js weaponKit()). */
  kitA: string;
  kitB: string;
}

export interface BuildChoreographyOpts {
  rng?: () => number;
  /** 4a.4: клас на героя — виж loadout.js weaponKit(). */
  heroClass?: 'warrior' | 'ranger' | 'mage' | 'rogue' | null;
  /** 4a.4 (кръг 2): свободния текст на foe.name — виж loadout.js weaponKit(). */
  foeName?: string;
  /** 4b: foe.sprite от сървъра — виж loadout.js weaponKit()/beast-config.js bodyKind(). */
  foeSprite?: string;
}

export function buildChoreography(
  rounds: GenRound[],
  victory: boolean,
  opts?: BuildChoreographyOpts,
): GeneratedChoreography;

export function mulberry32(seed: number): () => number;
