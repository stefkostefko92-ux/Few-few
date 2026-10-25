import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { checkbox, first, optionalString, requiredInt } from '../forms.js';
import { canChangeRole, isRole } from '../rbac.js';
import { done } from '../render.js';
import { findTarget } from '../target.js';
import { resetTotp } from '../totp-service.js';

/**
 * Действията върху играч от профила. Всяко: възможността (композиторът) → immunity и правилото
 * на действието (тук) → запис + одит в една транзакция → `reload` към плъгина (най-добро усилие).
 */
const roleBody = z.object({ role: z.preprocess(first, z.string().max(16)) });
const vipBody = z.object({
  tierId: requiredInt(1, 2_147_483_647),
  days: requiredInt(1, 3650),
  note: optionalString(255),
});
const hideBody = z.object({ hidden: checkbox });
const grantParam = requiredInt(1, 2_147_483_647);
const DAY_MS = 24 * 60 * 60 * 1000;

const profile = (steamId: string) => `/admin/players/${steamId}`;

export function playerActionRoutes(ctx: AdminCtx): AdminRoute[] {
  /** Целта от адреса + immunity (общото правило в `target.ts`). */
  const target = (req: Request, role: Role) => findTarget(ctx, req, role);
  /** VIP е козметика (§1): освен по-ниските, вписаният може да даде/отнеме VIP и на себе си. */
  const vipTarget = (req: Request, principal: { role: Role; steamId: string }) =>
    findTarget(ctx, req, principal.role, principal.steamId);

  /** Ролите, VIP и наказанията идват заедно при плъгина — едно `reload` ги опреснява (§5). */
  async function reload(actor: string, what: 'roles' | 'vip'): Promise<void> {
    await ctx.bridge.send('reload', { what }, actor);
  }

  return [
    {
      method: 'post',
      path: '/players/:steamId/role',
      cap: 'roles',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await target(req, principal.role);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        const body = roleBody.safeParse(req.body);
        const next = body.success ? body.data.role : '';
        if (!isRole(next)) return done(res, profile(found.steamId), 'invalid');
        const denial = canChangeRole(principal.role, found.role, next);
        if (denial)
          return done(res, profile(found.steamId), denial === 'role' ? 'denied' : 'immune');
        await ctx.db.$transaction(async (tx) => {
          await tx.player.update({ where: { steamId: found.steamId }, data: { role: next } });
          // Изход на всички устройства при смяна на роля (§10).
          await tx.webSession.deleteMany({ where: { steamId: found.steamId } });
          await audit(tx, {
            actor: principal.steamId,
            action: 'role.change',
            target: found.steamId,
            details: { from: found.role, to: next },
          });
        });
        await reload(principal.steamId, 'roles');
        done(res, profile(found.steamId), 'saved');
      },
    },
    {
      method: 'post',
      path: '/players/:steamId/vip',
      cap: 'vip',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await vipTarget(req, principal);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        const body = vipBody.safeParse(req.body);
        if (!body.success) return done(res, profile(found.steamId), 'invalid');
        const tier = await ctx.db.vipTier.findUnique({ where: { id: body.data.tierId } });
        if (!tier) return done(res, profile(found.steamId), 'invalid');
        const now = ctx.now();
        await ctx.db.$transaction(async (tx) => {
          // Удължаване: новият период започва след края на текущия активен VIP, ако има такъв.
          const latest = await tx.vipGrant.findFirst({
            where: { steamId: found.steamId, revokedAt: null, endsAt: { gt: now } },
            orderBy: { endsAt: 'desc' },
            select: { endsAt: true },
          });
          const startsAt = latest ? latest.endsAt : now;
          const endsAt = new Date(startsAt.getTime() + body.data.days * DAY_MS);
          const grant = await tx.vipGrant.create({
            data: {
              steamId: found.steamId,
              tierId: tier.id,
              startsAt,
              endsAt,
              grantedBy: principal.steamId,
              note: body.data.note ?? null,
            },
            select: { id: true },
          });
          await audit(tx, {
            actor: principal.steamId,
            action: 'vip.grant',
            target: found.steamId,
            details: {
              grantId: grant.id,
              tier: tier.code,
              days: body.data.days,
              endsAt: endsAt.toISOString(),
            },
          });
        });
        await reload(principal.steamId, 'vip');
        done(res, profile(found.steamId), 'saved');
      },
    },
    {
      method: 'post',
      path: '/players/:steamId/vip/:grantId/revoke',
      cap: 'vip',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await vipTarget(req, principal);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        const grantId = grantParam.safeParse(req.params.grantId);
        if (!grantId.success) return done(res, profile(found.steamId), 'invalid');
        const now = ctx.now();
        const revoked = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.vipGrant.updateMany({
            where: { id: grantId.data, steamId: found.steamId, revokedAt: null },
            data: { revokedAt: now },
          });
          if (updated.count !== 1) return false;
          await audit(tx, {
            actor: principal.steamId,
            action: 'vip.revoke',
            target: found.steamId,
            details: { grantId: grantId.data },
          });
          return true;
        });
        if (!revoked) return done(res, profile(found.steamId), 'notActive');
        await reload(principal.steamId, 'vip');
        done(res, profile(found.steamId), 'saved');
      },
    },
    {
      method: 'post',
      path: '/players/:steamId/hide',
      cap: 'privacy',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await target(req, principal.role);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        const hidden = hideBody.parse(req.body).hidden;
        await ctx.db.$transaction(async (tx) => {
          await tx.player.update({
            where: { steamId: found.steamId },
            data: { hiddenFromLeaderboards: hidden },
          });
          await audit(tx, {
            actor: principal.steamId,
            action: hidden ? 'player.hide' : 'player.unhide',
            target: found.steamId,
          });
        });
        done(res, profile(found.steamId), 'saved');
      },
    },
    {
      method: 'post',
      path: '/players/:steamId/totp-reset',
      cap: 'roles',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await target(req, principal.role);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        await resetTotp(ctx, principal.steamId, found.steamId);
        done(res, profile(found.steamId), 'saved');
      },
    },
    {
      method: 'post',
      path: '/players/:steamId/logout',
      cap: 'roles',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await target(req, principal.role);
        if (!found.ok)
          return done(res, found.steamId ? profile(found.steamId) : '/admin/players', found.code);
        await ctx.db.$transaction(async (tx) => {
          await tx.webSession.deleteMany({ where: { steamId: found.steamId } });
          await audit(tx, {
            actor: principal.steamId,
            action: 'web.logout_forced',
            target: found.steamId,
          });
        });
        done(res, profile(found.steamId), 'saved');
      },
    },
  ];
}
