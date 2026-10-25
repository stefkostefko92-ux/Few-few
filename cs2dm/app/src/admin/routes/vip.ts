import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import {
  centsToInput,
  checkbox,
  euroToCents,
  optionalInt,
  requiredInt,
  requiredString,
} from '../forms.js';
import { done, renderAdmin } from '../render.js';

/**
 * Нивата на VIP (ADMIN+). Цената е с ДДС в ЦЕЛИ евроцентове: полето „12,50“ се разглобява като
 * низ направо в 1250 — без float по пътя. Нивото с дарения/заявки не се трие (FK), а се спира.
 * Ръчното даване на VIP (профилът на играча) не е продажба — без сума и без плащане.
 */
const tierBody = z.object({
  code: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
  ),
  name: requiredString(64),
  price: requiredString(16),
  periodDays: requiredInt(1, 3650),
  sortOrder: optionalInt(-100_000, 100_000),
  active: checkbox,
});
const idParam = requiredInt(1, 2_147_483_647);

function parseTier(body: unknown) {
  const parsed = tierBody.safeParse(body);
  if (!parsed.success) return null;
  const priceCents = euroToCents(parsed.data.price);
  if (priceCents === null) return null;
  const { price: _price, sortOrder, ...rest } = parsed.data;
  return { ...rest, priceCents, sortOrder: sortOrder ?? 0 };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function vipRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/vip',
      cap: 'vip',
      handle: async (req, res) => {
        const tiers = await ctx.db.vipTier.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: { _count: { select: { grants: true, requests: true } } },
        });
        renderAdmin(req, res, 'vip', {
          current: 'vip',
          tiers: tiers.map((tier) => ({ ...tier, priceInput: centsToInput(tier.priceCents) })),
        });
      },
    },
    {
      method: 'post',
      path: '/vip/tiers',
      cap: 'vip',
      handle: async (req, res) => {
        const principal = me(res);
        const data = parseTier(req.body);
        if (!data) return done(res, '/admin/vip', 'invalid');
        try {
          await ctx.db.$transaction(async (tx) => {
            const tier = await tx.vipTier.create({ data, select: { id: true } });
            await audit(tx, {
              actor: principal.steamId,
              action: 'vip_tier.create',
              details: { tierId: tier.id, ...data },
            });
          });
        } catch (error) {
          if (isUniqueViolation(error)) return done(res, '/admin/vip', 'duplicate');
          throw error;
        }
        done(res, '/admin/vip', 'saved');
      },
    },
    {
      method: 'post',
      path: '/vip/tiers/:id',
      cap: 'vip',
      handle: async (req, res) => {
        const principal = me(res);
        const id = idParam.safeParse(req.params.id);
        const data = parseTier(req.body);
        if (!id.success || !data) return done(res, '/admin/vip', 'invalid');
        try {
          const updated = await ctx.db.$transaction(async (tx) => {
            const before = await tx.vipTier.findUnique({ where: { id: id.data } });
            if (!before) return false;
            await tx.vipTier.update({ where: { id: id.data }, data });
            await audit(tx, {
              actor: principal.steamId,
              action: 'vip_tier.update',
              details: {
                tierId: id.data,
                before: {
                  code: before.code,
                  name: before.name,
                  priceCents: before.priceCents,
                  periodDays: before.periodDays,
                  active: before.active,
                  sortOrder: before.sortOrder,
                },
                after: data,
              },
            });
            return true;
          });
          done(res, '/admin/vip', updated ? 'saved' : 'notFound');
        } catch (error) {
          if (isUniqueViolation(error)) return done(res, '/admin/vip', 'duplicate');
          throw error;
        }
      },
    },
    {
      method: 'post',
      path: '/vip/tiers/:id/delete',
      cap: 'vip',
      handle: async (req, res) => {
        const principal = me(res);
        const id = idParam.safeParse(req.params.id);
        if (!id.success) return done(res, '/admin/vip', 'invalid');
        const result = await ctx.db.$transaction(async (tx) => {
          const tier = await tx.vipTier.findUnique({
            where: { id: id.data },
            include: { _count: { select: { grants: true, requests: true } } },
          });
          if (!tier) return 'notFound' as const;
          if (tier._count.grants > 0 || tier._count.requests > 0) return 'inUse' as const;
          await tx.vipTier.delete({ where: { id: id.data } });
          await audit(tx, {
            actor: principal.steamId,
            action: 'vip_tier.delete',
            details: { tierId: id.data, code: tier.code },
          });
          return 'saved' as const;
        });
        done(res, '/admin/vip', result);
      },
    },
  ];
}
