import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { pagesFor } from '../../data/repo.js';
import { audit, verifyAuditChain } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { first, optionalString, pageParam, requiredInt } from '../forms.js';
import { done, renderAdmin } from '../render.js';

/** Банерите в картата (§8) и одит-веригата (§6) — HEADADMIN+. */
const AUDIT_PAGE_SIZE = 100;
const SOURCES = ['GAME', 'WEB', 'DISCORD', 'SYSTEM'] as const;
const auditQuery = z.object({
  action: optionalString(64).catch(undefined),
  actor: optionalString(17).catch(undefined),
  target: optionalString(17).catch(undefined),
  source: z.preprocess(first, z.enum(SOURCES).optional()).catch(undefined),
  verify: z.preprocess((value) => first(value) === '1', z.boolean()),
  page: pageParam,
});
const idParam = requiredInt(1, 2_147_483_647);

/** jsonb за показ: кратък ред, без да се разчита на реда на ключовете. */
function detailsText(details: Prisma.JsonValue): string {
  const text = JSON.stringify(details);
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

export function recordRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/banners',
      cap: 'banners',
      handle: async (req, res) => {
        const rows = await ctx.db.mapBanner.findMany({
          orderBy: [{ map: 'asc' }, { id: 'asc' }],
          take: 500,
        });
        renderAdmin(req, res, 'banners', { current: 'banners', rows });
      },
    },
    {
      method: 'post',
      path: '/banners/:id/delete',
      cap: 'banners',
      handle: async (req, res) => {
        const principal = me(res);
        const id = idParam.safeParse(req.params.id);
        if (!id.success) return done(res, '/admin/banners', 'invalid');
        const removed = await ctx.db.$transaction(async (tx) => {
          const banner = await tx.mapBanner.findUnique({ where: { id: id.data } });
          if (!banner) return false;
          await tx.mapBanner.delete({ where: { id: id.data } });
          // Същото действие като `!banner remove` в играта; плъгинът презарежда при смяна на картата.
          await audit(tx, {
            actor: principal.steamId,
            action: 'banner.remove',
            details: { bannerId: banner.id, map: banner.map, key: banner.bannerKey },
          });
          return true;
        });
        done(res, '/admin/banners', removed ? 'saved' : 'notFound');
      },
    },
    {
      method: 'get',
      path: '/audit',
      cap: 'audit',
      handle: async (req, res) => {
        const query = auditQuery.parse(req.query);
        const and: Prisma.AuditLogWhereInput[] = [];
        if (query.action) and.push({ action: { startsWith: query.action } });
        if (query.actor) and.push({ actorSteamId: query.actor });
        if (query.target) and.push({ targetSteamId: query.target });
        if (query.source) and.push({ source: query.source });
        const where = { AND: and };
        const [rows, total, chain] = await Promise.all([
          ctx.db.auditLog.findMany({
            where,
            orderBy: { id: 'desc' },
            skip: (query.page - 1) * AUDIT_PAGE_SIZE,
            take: AUDIT_PAGE_SIZE,
          }),
          ctx.db.auditLog.count({ where }),
          query.verify ? verifyAuditChain(ctx.db) : Promise.resolve(null),
        ]);
        renderAdmin(req, res, 'audit', {
          current: 'audit',
          query,
          sources: SOURCES,
          rows: rows.map((row) => ({
            ...row,
            id: row.id.toString(),
            details: detailsText(row.details),
          })),
          chain: chain
            ? { ...chain, brokenAt: chain.brokenAt === null ? null : chain.brokenAt.toString() }
            : null,
          total,
          page: query.page,
          pages: pagesFor(total, AUDIT_PAGE_SIZE),
        });
      },
    },
  ];
}
