import type { PrismaClient } from '@prisma/client';
import { DM_MODES } from '../admin/server-data.js';
import { EVENT_PUBLIC_DAYS, type PublicEvent } from '../events.js';
import { multiplierTenths } from '../settings.js';
import { displayName } from '../steamid.js';
import type { MatchDetail, MatchListRow } from './repo.js';

/**
 * Четенето за публичните блокове, добавени след етап 1 (събития — CONTRACT §12, мачове — §13). Отделно от
 * `prisma-repo.ts`, за да остане всеки файл кратък; PrismaRepo само препраща.
 */
const DAY_MS = 86_400_000;

/** Активните и предстоящите (до 30 дни напред) неотменени събития, по начало. */
export async function loadEvents(db: PrismaClient, now: Date, limit = 6): Promise<PublicEvent[]> {
  const rows = await db.scheduledEvent.findMany({
    where: {
      cancelledAt: null,
      endsAt: { gt: now },
      startsAt: { lt: new Date(now.getTime() + EVENT_PUBLIC_DAYS * DAY_MS) },
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: {
      id: true,
      kind: true,
      titleBg: true,
      titleEn: true,
      titleIt: true,
      startsAt: true,
      endsAt: true,
      xpMultiplier: true,
      dmModeId: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    titles: { bg: row.titleBg, en: row.titleEn, it: row.titleIt },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    xpTenths: multiplierTenths(row.xpMultiplier.toNumber()),
    modeName: DM_MODES.find((mode) => mode.id === row.dmModeId)?.name ?? null,
  }));
}

/** Играчът е скрит (чл. 21 GDPR) → без SteamID и без име, навсякъде публично. */
function visible(row: {
  steamId: string;
  name: string;
  player: { hiddenFromLeaderboards: boolean };
}) {
  return row.player.hiddenFromLeaderboards
    ? { steamId: null, name: null }
    : { steamId: row.steamId, name: displayName(row.name, row.steamId) };
}

const playerFlag = { select: { hiddenFromLeaderboards: true } } as const;

/** Последните мачове (CONTRACT §13) с първия по място. */
export async function loadRecentMatches(db: PrismaClient, limit: number): Promise<MatchListRow[]> {
  const rows = await db.match.findMany({
    orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      rows: {
        where: { place: 1 },
        take: 1,
        select: { steamId: true, name: true, kills: true, player: playerFlag },
      },
    },
  });
  return rows.map(({ rows: [first], ...match }) => ({
    id: match.id,
    map: match.map,
    mode: match.mode,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    kills: match.kills,
    players: match.players,
    top: first ? { ...visible(first), kills: first.kills } : null,
  }));
}

/** Един мач с редовете по място; скритите играчи — без име и SteamID. */
export async function loadMatch(db: PrismaClient, id: number): Promise<MatchDetail | null> {
  const match = await db.match.findUnique({
    where: { id },
    include: {
      event: { select: { titleBg: true, titleEn: true, titleIt: true } },
      rows: { orderBy: { place: 'asc' }, include: { player: playerFlag } },
    },
  });
  if (!match) return null;
  return {
    id: match.id,
    map: match.map,
    mode: match.mode,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    kills: match.kills,
    players: match.players,
    seasonId: match.seasonId,
    xpTenths: multiplierTenths(match.xpMultiplier.toNumber()),
    event: match.event
      ? { bg: match.event.titleBg, en: match.event.titleEn, it: match.event.titleIt }
      : null,
    rows: match.rows.map((row) => ({
      place: row.place,
      ...visible(row),
      kills: row.kills,
      deaths: row.deaths,
      headshots: row.headshots,
      bestStreak: row.bestStreak,
      bountiesClaimed: row.bountiesClaimed,
      xp: row.xp,
      topWeapon: row.topWeapon,
      topWeaponKills: row.topWeaponKills,
    })),
  };
}
