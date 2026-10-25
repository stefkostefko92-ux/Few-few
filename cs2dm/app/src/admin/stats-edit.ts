import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { checkbox, first } from './forms.js';

/**
 * Ръчната редакция на статистиките (CONTRACT §3, „епоха“). Плъгинът добавя партиди с `+=`, затова
 * всяка редакция вдига `stats_epoch` на играча и на ВСИЧКИ негови редове в една транзакция; партида със
 * стара епоха вече не пипа редовете (`WHERE ред.stats_epoch <= партида`), а `player.reload` кара
 * плъгина да вземе стойностите от базата и да изхвърли натрупаното за играча.
 */
export const SEASON_INT_FIELDS = [
  'kills',
  'deaths',
  'headshots',
  'assists',
  'damage',
  'shotsFired',
  'shotsHit',
  'bestStreak',
  'bountiesClaimed',
  'revenges',
  'playtimeSec',
] as const;
export type SeasonIntField = (typeof SEASON_INT_FIELDS)[number];

/** Разумни тавани (колоните са int4 → под 2 147 483 647). */
export const STAT_MAX: Record<SeasonIntField, number> = {
  kills: 10_000_000,
  deaths: 10_000_000,
  headshots: 10_000_000,
  assists: 10_000_000,
  damage: 2_000_000_000,
  shotsFired: 2_000_000_000,
  shotsHit: 2_000_000_000,
  bestStreak: 100_000,
  bountiesClaimed: 10_000_000,
  revenges: 10_000_000,
  playtimeSec: 2_000_000_000,
};
export const XP_MAX = 1_000_000_000_000n;
export const WEAPON_MAX = 10_000_000;

/** Неотрицателно цяло от формата: само цифри (без „1e3“, „-1“, „1.5“), до тавана. */
const nonNegative = (max: number) =>
  z.preprocess(
    first,
    z
      .string()
      .trim()
      .regex(/^\d{1,10}$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(max)),
  );

const xpField = z.preprocess(
  first,
  z
    .string()
    .trim()
    .regex(/^\d{1,13}$/)
    .transform((value) => BigInt(value))
    .refine((value) => value <= XP_MAX),
);

const seasonShape = Object.fromEntries(
  SEASON_INT_FIELDS.map((field) => [field, nonNegative(STAT_MAX[field])]),
) as { [K in SeasonIntField]: ReturnType<typeof nonNegative> };

/** Сезонният ред: убийствата ограничават хедшотите, баунтитата и отмъщенията (всяко е убийство). */
export const seasonStatsForm = z
  .object({ ...seasonShape, xp: xpField })
  .refine((v) => v.headshots <= v.kills && v.bountiesClaimed <= v.kills && v.revenges <= v.kills, {
    message: 'more headshots/bounties/revenges than kills',
  });
export type SeasonStatsInput = z.infer<typeof seasonStatsForm>;

/** Името на оръжието е от плъгина (`Progression.NormalizeWeapon`): a–z, 0–9, „_“. */
export const weaponName = z.preprocess(first, z.string().regex(/^[a-z0-9_]{1,32}$/));
export const weaponForm = z
  .object({
    weapon: weaponName,
    kills: nonNegative(WEAPON_MAX),
    headshots: nonNegative(WEAPON_MAX),
  })
  .refine((v) => v.headshots <= v.kills);

export const playtimeForm = z.object({ playtimeSec: nonNegative(STAT_MAX.playtimeSec) });

/** Нулиране: само с отметнато потвърждение (работи и без JavaScript). */
export const resetForm = z.object({
  scope: z.preprocess(first, z.enum(['season', 'all'])),
  confirm: checkbox.refine((value) => value),
});

/** Само променените полета → `{before, after}` за одита (XP като низ — JSON няма bigint). */
export function changes(
  before: Record<string, unknown>,
  after: Record<string, number | bigint>,
): { before: Record<string, number | string>; after: Record<string, number | string> } | null {
  const out = {
    before: {} as Record<string, number | string>,
    after: {} as Record<string, number | string>,
  };
  for (const [key, value] of Object.entries(after)) {
    const old = before[key];
    if ((typeof old !== 'number' && typeof old !== 'bigint') || old === value) continue;
    out.before[key] = typeof old === 'bigint' ? old.toString() : old;
    out.after[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return Object.keys(out.after).length > 0 ? out : null;
}

const epochRow = z.array(z.object({ epoch: z.number().int() }));

/**
 * Вдига епохата на играча и на всичките му редове (заключва реда в `players` — плъгинът също почва
 * партидата си от него, затова редът на заключване е един и същ). null = няма такъв играч.
 */
export async function bumpEpoch(
  tx: Prisma.TransactionClient,
  steamId: string,
): Promise<number | null> {
  const raw = await tx.$queryRaw<unknown[]>`
    SELECT stats_epoch AS epoch FROM players WHERE steam_id = ${steamId} FOR UPDATE`;
  const current = epochRow.parse(raw)[0]?.epoch;
  if (current === undefined) return null;
  const next = current + 1;
  await tx.player.update({ where: { steamId }, data: { statsEpoch: next } });
  await tx.playerSeasonStats.updateMany({ where: { steamId }, data: { statsEpoch: next } });
  await tx.weaponSeasonStats.updateMany({ where: { steamId }, data: { statsEpoch: next } });
  return next;
}

/** Нулевите стойности на сезонен ред — за „нулирай“. */
export const ZERO_SEASON: Omit<SeasonStatsInput, 'xp'> & { xp: bigint } = {
  ...(Object.fromEntries(SEASON_INT_FIELDS.map((field) => [field, 0])) as Record<
    SeasonIntField,
    number
  >),
  xp: 0n,
};

/** Сезонен ред за одита: всички полета, XP като низ. */
export function seasonRowJson(
  row: Record<SeasonIntField, number> & { seasonId: number; xp: bigint },
) {
  return {
    seasonId: row.seasonId,
    ...Object.fromEntries(SEASON_INT_FIELDS.map((field) => [field, row[field]])),
    xp: row.xp.toString(),
  };
}
