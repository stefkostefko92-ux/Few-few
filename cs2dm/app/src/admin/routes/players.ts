import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { pagesFor } from '../../data/repo.js';
import { displayName, parseSteamId } from '../../steamid.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { first, optionalString, pageParam } from '../forms.js';
import {
  PANEL_MIN_ROLE,
  ROLE_LEVEL,
  assignableRoles,
  atLeast,
  can,
  minRoleToRevoke,
  outranks,
} from '../rbac.js';
import { renderAdmin, renderAdminError } from '../render.js';
import { statsEditorData } from './stats.js';

/** Търсене на играчи и профилът им за админите (наказания, сесии, VIP, доклади). */
const PAGE_SIZE = 50;
const listQuery = z.object({
  q: optionalString(64).catch(undefined),
  staff: z.preprocess((value) => first(value) === '1', z.boolean()),
  page: pageParam,
});

export function playerRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/players',
      cap: 'panel',
      handle: async (req, res) => {
        const query = listQuery.parse(req.query);
        const and: Prisma.PlayerWhereInput[] = [];
        if (query.q) {
          and.push(
            /^\d{17}$/.test(query.q)
              ? { steamId: query.q }
              : { name: { contains: query.q, mode: 'insensitive' } },
          );
        }
        if (query.staff) {
          const staff = Object.entries(ROLE_LEVEL)
            .filter(([, level]) => level >= ROLE_LEVEL[PANEL_MIN_ROLE])
            .map(([role]) => role as keyof typeof ROLE_LEVEL);
          and.push({ role: { in: staff } });
        }
        const where = { AND: and };
        const [rows, total] = await Promise.all([
          ctx.db.player.findMany({
            where,
            orderBy: [{ lastSeenAt: 'desc' }, { steamId: 'asc' }],
            skip: (query.page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            select: {
              steamId: true,
              name: true,
              role: true,
              lastSeenAt: true,
              hiddenFromLeaderboards: true,
              totpEnabledAt: true,
            },
          }),
          ctx.db.player.count({ where }),
        ]);
        renderAdmin(req, res, 'players', {
          current: 'players',
          query,
          rows: rows.map((row) => ({ ...row, name: displayName(row.name, row.steamId) })),
          total,
          page: query.page,
          pages: pagesFor(total, PAGE_SIZE),
        });
      },
    },
    {
      method: 'get',
      path: '/players/:steamId',
      cap: 'panel',
      handle: async (req, res) => {
        const principal = me(res);
        const steamId = parseSteamId(req.params.steamId);
        if (!steamId) return renderAdminError(req, res, 'notFound');
        const player = await ctx.db.player.findUnique({
          where: { steamId },
          select: {
            steamId: true,
            name: true,
            role: true,
            lang: true,
            firstSeenAt: true,
            lastSeenAt: true,
            playtimeSec: true,
            webLoginAt: true,
            totpEnabledAt: true,
            hiddenFromLeaderboards: true,
          },
        });
        if (!player) return renderAdminError(req, res, 'notFound');
        const now = ctx.now();
        const seeIps = can(principal.role, 'privacy');
        const [punishments, sessions, grants, reports, stats, tiers] = await Promise.all([
          ctx.db.punishment.findMany({
            where: { steamId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
          }),
          ctx.db.session.findMany({
            where: { steamId },
            orderBy: { connectedAt: 'desc' },
            take: 20,
            // IP само за ADMIN+ (минимизация): останалите виждат кога, не откъде.
            select: { id: true, connectedAt: true, disconnectedAt: true, ip: seeIps },
          }),
          ctx.db.vipGrant.findMany({
            where: { steamId },
            orderBy: { endsAt: 'desc' },
            take: 50,
            include: { tier: { select: { name: true, code: true } } },
          }),
          ctx.db.report.findMany({
            where: { targetSteamId: steamId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
          ctx.db.playerSeasonStats.findUnique({
            where: { steamId_seasonId: { steamId, seasonId: 0 } },
            select: { kills: true, deaths: true, headshots: true, xp: true },
          }),
          can(principal.role, 'vip')
            ? ctx.db.vipTier.findMany({
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: { id: true, name: true, code: true, periodDays: true, active: true },
              })
            : Promise.resolve([]),
        ]);
        const isActive = (start: Date | null, end: Date | null, revoked: Date | null) =>
          revoked === null &&
          (start === null || start.getTime() <= now.getTime()) &&
          (end === null || end.getTime() > now.getTime());
        const above = outranks(principal.role, player.role);
        // VIP — над целта или на себе си (козметика, §1); всичко друго иска `above`.
        const vipAllowed = above || player.steamId === principal.steamId;
        // Редакторът на статистиките — HEADADMIN+ и само над целта (immunity, §1).
        const editor =
          above && can(principal.role, 'playerData') ? await statsEditorData(ctx, steamId) : null;
        renderAdmin(req, res, 'player', {
          current: 'players',
          player: { ...player, name: displayName(player.name, player.steamId) },
          punishments: punishments.map((row) => ({
            ...row,
            active: isActive(null, row.expiresAt, row.revokedAt),
            canRevoke: above && atLeast(principal.role, minRoleToRevoke(row.type)),
          })),
          sessions,
          seeIps,
          grants: grants.map((grant) => ({
            ...grant,
            active: isActive(grant.startsAt, grant.endsAt, grant.revokedAt),
          })),
          reports,
          stats,
          tiers,
          above,
          vipAllowed,
          editor,
          assignable: above ? assignableRoles(principal.role) : [],
        });
      },
    },
  ];
}
