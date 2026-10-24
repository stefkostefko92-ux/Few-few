import type { Prisma, PunishmentCategory } from '@prisma/client';
import { z } from 'zod';
import { BAN_CATEGORIES, pagesFor } from '../../data/repo.js';
import { displayName } from '../../steamid.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import {
  DURATION_UNITS,
  durationFields,
  durationMs,
  first,
  formSteamId,
  optionalString,
  pageParam,
  requiredInt,
  requiredString,
} from '../forms.js';
import { createPunishment, revokePunishment } from '../punish.js';
import { PUNISH_TYPES, atLeast, minRoleToPunish, minRoleToRevoke, outranks } from '../rbac.js';
import { done, renderAdmin } from '../render.js';

/**
 * Вътрешният списък с наказанията — С причината и админа (CONTRACT §2: само за админи). НЕ е
 * публичният банлист: той чете само `PUBLIC_BAN_SELECT` в `data/prisma-repo.ts`.
 */
export const PAGE_SIZE = 50;
const ALL_TYPES = ['BAN', 'MUTE', 'GAG', 'SILENCE', 'WARN', 'KICK'] as const;
const STATUSES = ['active', 'expired', 'revoked', 'all'] as const;
const SOURCES = ['GAME', 'WEB', 'DISCORD', 'SYSTEM'] as const;

const opt = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(first, z.enum(values).optional()).catch(undefined);

export const listQuery = z.object({
  q: optionalString(64).catch(undefined),
  type: opt(ALL_TYPES),
  status: z.preprocess(first, z.enum(STATUSES)).catch('active'),
  category: opt(BAN_CATEGORIES),
  source: opt(SOURCES),
  actor: optionalString(17).catch(undefined),
  reason: optionalString(100).catch(undefined),
  page: pageParam,
});

const newBody = durationFields.extend({
  steamId: formSteamId,
  name: optionalString(64),
  type: z.preprocess(first, z.enum(PUNISH_TYPES)),
  category: z.preprocess(first, z.enum(BAN_CATEGORIES)).catch('OTHER'),
  reason: requiredString(255),
});
const revokeBody = z.object({ reason: requiredString(255) });
const idParam = requiredInt(1, 2_147_483_647);

export function punishmentWhere(
  query: z.infer<typeof listQuery>,
  now: Date,
): Prisma.PunishmentWhereInput {
  const and: Prisma.PunishmentWhereInput[] = [];
  if (query.q) {
    and.push(
      /^\d{17}$/.test(query.q)
        ? { steamId: query.q }
        : { targetName: { contains: query.q, mode: 'insensitive' } },
    );
  }
  if (query.type) and.push({ type: query.type });
  if (query.category) and.push({ category: query.category });
  if (query.source) and.push({ source: query.source });
  if (query.actor) and.push({ actorSteamId: query.actor });
  if (query.reason) and.push({ reason: { contains: query.reason, mode: 'insensitive' } });
  if (query.status === 'active') {
    and.push({ revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
  } else if (query.status === 'expired') {
    and.push({ revokedAt: null, expiresAt: { lte: now } });
  } else if (query.status === 'revoked') {
    and.push({ revokedAt: { not: null } });
  }
  return { AND: and };
}

export function punishmentRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/punishments',
      cap: 'panel',
      handle: async (req, res) => {
        const principal = me(res);
        const query = listQuery.parse(req.query);
        const now = ctx.now();
        const where = punishmentWhere(query, now);
        const [rows, total] = await Promise.all([
          ctx.db.punishment.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: { target: { select: { role: true } } },
          }),
          ctx.db.punishment.count({ where }),
        ]);
        const prefill = formSteamId.safeParse(req.query.steamId);
        renderAdmin(req, res, 'punishments', {
          current: 'punishments',
          query,
          rows: rows.map((row) => ({
            ...row,
            targetName: displayName(row.targetName, row.steamId),
            active:
              row.revokedAt === null &&
              (row.expiresAt === null || row.expiresAt.getTime() > now.getTime()),
            canRevoke:
              atLeast(principal.role, minRoleToRevoke(row.type)) &&
              outranks(principal.role, row.target.role),
          })),
          total,
          page: query.page,
          pages: pagesFor(total, PAGE_SIZE),
          filters: { types: ALL_TYPES, statuses: STATUSES, sources: SOURCES },
          categories: BAN_CATEGORIES,
          units: DURATION_UNITS,
          newTypes: PUNISH_TYPES.filter((type) =>
            atLeast(principal.role, minRoleToPunish(type, type === 'BAN' ? 0 : null)),
          ),
          prefill: prefill.success ? prefill.data : '',
        });
      },
    },
    {
      method: 'post',
      path: '/punishments',
      cap: 'panel',
      handle: async (req, res) => {
        const body = newBody.safeParse(req.body);
        if (!body.success) return done(res, '/admin/punishments', 'invalid');
        const duration = durationMs(body.data);
        if (duration === undefined) return done(res, '/admin/punishments', 'invalid');
        const code = await createPunishment(ctx, me(res), {
          type: body.data.type,
          steamId: body.data.steamId,
          name: body.data.name,
          category: body.data.category as PunishmentCategory,
          reason: body.data.reason,
          durationMs: duration,
        });
        done(res, `/admin/punishments?q=${body.data.steamId}&status=all`, code);
      },
    },
    {
      method: 'post',
      path: '/punishments/:id/revoke',
      cap: 'panel',
      handle: async (req, res) => {
        const id = idParam.safeParse(req.params.id);
        const body = revokeBody.safeParse(req.body);
        if (!id.success || !body.success) return done(res, '/admin/punishments', 'invalid');
        const code = await revokePunishment(ctx, me(res), id.data, body.data.reason);
        done(res, '/admin/punishments?status=all', code);
      },
    },
  ];
}
