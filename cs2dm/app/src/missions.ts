import { utcToZonedInput } from './events.js';
import { missionXp } from './levels.js';

/**
 * Мисиите за деня (CONTRACT §16) — огледалото на `MissionPool` от C# плъгина. Три на играч на ден (лесна, средна,
 * трудна), избрани детерминистично: FNV-1a 32 върху UTF-8 на `<steamId>:<yyyy-MM-dd>:<трудност>` по модул
 * дължината на пула. Денят е местната дата в DISPLAY_TZ — същата зона като `CS2DM_DISPLAY_TZ` на плъгина. Така
 * сайтът показва трите мисии и без ред в базата (плъгинът записва избора, когато играчът влезе).
 * `tests/missions.test.ts` чете пула от `.cs` файла и проверява същите вектори като xunit.
 */
export const MISSION_KINDS = [
  'headshots',
  'rifle',
  'smg',
  'pistol',
  'sniper',
  'knife',
  'wallbang',
  'smoke',
  'noscope',
  'streak',
  'zone',
  'wanted',
  'duel',
  'minutes',
] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

/** Трудностите по ред — за текстовете (`missions.tiers.<id>`). */
export const MISSION_TIERS = ['easy', 'medium', 'hard'] as const;

export interface MissionDef {
  key: string;
  kind: MissionKind;
  target: number;
  /** 0 лесна · 1 средна · 2 трудна. */
  tier: number;
  xp: number;
}

const mission = (kind: MissionKind, target: number, tier: number): MissionDef => ({
  key: `${kind}_${target}`,
  kind,
  target,
  tier,
  xp: missionXp(tier),
});

export const MISSION_POOL: readonly (readonly MissionDef[])[] = [
  [
    mission('headshots', 10, 0),
    mission('pistol', 10, 0),
    mission('smg', 10, 0),
    mission('rifle', 15, 0),
    mission('streak', 5, 0),
    mission('minutes', 30, 0),
  ],
  [
    mission('headshots', 25, 1),
    mission('rifle', 30, 1),
    mission('sniper', 10, 1),
    mission('wallbang', 1, 1),
    mission('smoke', 1, 1),
    mission('zone', 3, 1),
    mission('minutes', 60, 1),
  ],
  [
    mission('knife', 1, 2),
    mission('noscope', 1, 2),
    mission('wanted', 1, 2),
    mission('duel', 1, 2),
    mission('streak', 10, 2),
    mission('headshots', 50, 2),
  ],
];

const encoder = new TextEncoder();

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}

/** Местната дата `yyyy-MM-dd` в зоната — границата на деня е местната полунощ. */
export function missionDay(now: Date, timeZone: string): string {
  return utcToZonedInput(now, timeZone).slice(0, 10);
}

export function assignMissions(steamId: string, day: string): MissionDef[] {
  return MISSION_POOL.map((pool, tier) => {
    const picked = pool[fnv1a(`${steamId}:${day}:${tier}`) % pool.length];
    if (!picked) throw new Error(`празен пул за трудност ${tier}`);
    return picked;
  });
}

/** Мисиите на играча за публичния профил: днешните три с напредъка и колко е изпълнил за срока (90 дни). */
export interface PlayerMissions {
  day: string;
  today: Array<MissionDef & { progress: number; done: boolean }>;
  completed: number;
}
