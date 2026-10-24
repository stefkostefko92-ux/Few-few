import type { Prisma } from '@prisma/client';
import { displayName, parseSteamId } from '../../steamid.js';
import type { AdminCtx, AdminRoute } from '../context.js';
import { renderAdmin, renderAdminError } from '../render.js';

/**
 * „Всичко, което пазим за играча“ — само четене (HEADADMIN+, `playerData`). Колоните са имената в
 * базата (@map) — това е суровият запис, не обобщение. Тайни никога: TOTP тайната е само „има/няма“,
 * токените на сесиите и хешовете на резервните кодове не се четат изобщо.
 */
export type Cell = string | number | bigint | boolean | Date | null | Prisma.JsonValue;

export interface DataSection {
  id: string;
  /** Общият брой, ако показваме само последните (иначе = редовете). */
  total: number;
  columns: string[];
  rows: Cell[][];
}

const LIMIT = 200;

/** camelCase (Prisma) → snake_case (колоната в базата). */
export function columnName(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

export function section<T extends object>(
  id: string,
  rows: T[],
  keys: Array<keyof T & string>,
  total = rows.length,
): DataSection {
  return {
    id,
    total,
    columns: keys.map(columnName),
    rows: rows.map((row) => keys.map((key) => row[key] as Cell)),
  };
}

export function playerDataRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/players/:steamId/data',
      cap: 'playerData',
      handle: async (req, res) => {
        const steamId = parseSteamId(req.params.steamId);
        if (!steamId) return renderAdminError(req, res, 'notFound');
        const player = await ctx.db.player.findUnique({ where: { steamId } });
        if (!player) return renderAdminError(req, res, 'notFound');
        const take = LIMIT;
        const byTime = { orderBy: { id: 'desc' as const }, take };
        const [
          sessions,
          webSessions,
          codes,
          seasonStats,
          weaponStats,
          punishments,
          issued,
          appeals,
          reportsAgainst,
          reportsBy,
          grants,
          requests,
          killsAsAttacker,
          killsAsVictim,
          lastKills,
          auditAbout,
          auditBy,
          banners,
        ] = await Promise.all([
          ctx.db.session.findMany({ where: { steamId }, ...byTime }),
          ctx.db.webSession.findMany({
            where: { steamId },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, expiresAt: true, role: true, mfaPassed: true, lang: true },
          }),
          ctx.db.webRecoveryCode.findMany({
            where: { steamId },
            select: { createdAt: true, usedAt: true },
          }),
          ctx.db.playerSeasonStats.findMany({ where: { steamId }, orderBy: { seasonId: 'asc' } }),
          ctx.db.weaponSeasonStats.findMany({
            where: { steamId },
            orderBy: [{ seasonId: 'asc' }, { kills: 'desc' }],
            take,
          }),
          ctx.db.punishment.findMany({ where: { steamId }, ...byTime }),
          ctx.db.punishment.count({ where: { actorSteamId: steamId } }),
          ctx.db.appeal.findMany({ where: { steamId }, ...byTime }),
          ctx.db.report.findMany({ where: { targetSteamId: steamId }, ...byTime }),
          ctx.db.report.findMany({ where: { reporterSteamId: steamId }, ...byTime }),
          ctx.db.vipGrant.findMany({ where: { steamId }, ...byTime }),
          ctx.db.vipRequest.findMany({ where: { steamId }, ...byTime }),
          ctx.db.kill.count({ where: { attackerId: steamId } }),
          ctx.db.kill.count({ where: { victimId: steamId } }),
          ctx.db.kill.findMany({
            where: { OR: [{ attackerId: steamId }, { victimId: steamId }] },
            orderBy: { id: 'desc' },
            take: 20,
          }),
          ctx.db.auditLog.findMany({ where: { targetSteamId: steamId }, ...byTime }),
          ctx.db.auditLog.count({ where: { actorSteamId: steamId } }),
          ctx.db.mapBanner.findMany({ where: { createdBy: steamId }, ...byTime }),
        ]);
        const { totpSecretEnc, ...rest } = player;
        const profile = { ...rest, totpSecretStored: totpSecretEnc !== null };
        const sections: DataSection[] = [
          section('player', [profile], Object.keys(profile) as Array<keyof typeof profile>),
          section('seasonStats', seasonStats, [
            'seasonId',
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
            'xp',
            'playtimeSec',
            'statsEpoch',
            'updatedAt',
          ]),
          section('weaponStats', weaponStats, [
            'seasonId',
            'weapon',
            'kills',
            'headshots',
            'statsEpoch',
          ]),
          section('sessions', sessions, ['id', 'ip', 'connectedAt', 'disconnectedAt']),
          section('webSessions', webSessions, [
            'createdAt',
            'expiresAt',
            'role',
            'mfaPassed',
            'lang',
          ]),
          section('recoveryCodes', codes, ['createdAt', 'usedAt']),
          section('punishments', punishments, [
            'id',
            'type',
            'category',
            'reason',
            'source',
            'actorSteamId',
            'createdAt',
            'expiresAt',
            'revokedAt',
            'revokedBy',
            'revokeReason',
          ]),
          section('appeals', appeals, [
            'id',
            'punishmentId',
            'status',
            'message',
            'contact',
            'createdAt',
            'handledAt',
            'handledBy',
            'decisionNote',
          ]),
          section('reportsAgainst', reportsAgainst, [
            'id',
            'reporterSteamId',
            'reason',
            'source',
            'status',
            'createdAt',
            'handledBy',
            'note',
          ]),
          section('reportsBy', reportsBy, ['id', 'targetSteamId', 'reason', 'status', 'createdAt']),
          section('vipGrants', grants, [
            'id',
            'tierId',
            'startsAt',
            'endsAt',
            'amountCents',
            'paymentMethod',
            'invoiceNo',
            'grantedBy',
            'note',
            'revokedAt',
          ]),
          section('vipRequests', requests, [
            'id',
            'tierId',
            'periods',
            'billingName',
            'billingAddress',
            'billingTaxId',
            'email',
            'status',
            'termsVersion',
            'createdAt',
            'handledAt',
          ]),
          section(
            'kills',
            lastKills.map((kill) => ({
              ...kill,
              role: kill.attackerId === steamId ? 'attacker' : 'victim',
            })),
            [
              'at',
              'role',
              'attackerId',
              'victimId',
              'weapon',
              'headshot',
              'mode',
              'distance',
              'ax',
              'ay',
              'vx',
              'vy',
            ],
            killsAsAttacker + killsAsVictim,
          ),
          section('auditAbout', auditAbout, [
            'id',
            'at',
            'actorSteamId',
            'action',
            'source',
            'details',
          ]),
          section('banners', banners, ['id', 'map', 'bannerKey', 'createdAt']),
        ];
        renderAdmin(req, res, 'player-data', {
          current: 'players',
          player: { steamId, name: displayName(player.name, steamId) },
          sections,
          counts: { killsAsAttacker, killsAsVictim, issued, auditBy },
          limit: LIMIT,
        });
      },
    },
  ];
}
