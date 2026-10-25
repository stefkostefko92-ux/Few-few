import type { PunishmentCategory, Role } from '@prisma/client';
import { z } from 'zod';
import { BAN_CATEGORIES } from '../../data/repo.js';
import { displayName } from '../../steamid.js';
import { audit } from '../audit.js';
import { commandErrorKey } from '../commands.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import {
  DURATION_UNITS,
  commandResultCode,
  durationFields,
  durationMs,
  first,
  formSteamId,
  optionalString,
  requiredInt,
  requiredString,
} from '../forms.js';
import { createPunishment, targetRole } from '../punish.js';
import {
  SLAY_MIN_ROLE,
  atLeast,
  checkTargetAction,
  minRoleToPunish,
  outranks,
  type PanelPunishType,
} from '../rbac.js';
import { done, renderAdmin } from '../render.js';
import { DM_MODES } from '../server-data.js';

/** Действията от реда на играч на живо: наказанията + `slay` (само команда, без запис). */
const LIVE_ACTIONS = ['KICK', 'SLAY', 'MUTE', 'GAG', 'SILENCE', 'BAN'] as const;

const liveActionBody = durationFields.extend({
  steamId: formSteamId,
  action: z.preprocess(first, z.enum(LIVE_ACTIONS)),
  category: z.preprocess(first, z.enum(BAN_CATEGORIES)).catch('OTHER'),
  reason: optionalString(255),
});
const sayBody = z.object({ text: requiredString(200) });
const modeBody = z.object({ modeId: requiredInt(0, 1000) });

/** Кои бутони да покаже редът: правото по ролята и immunity спрямо ролята от базата. */
function allowedActions(actor: Role, target: Role): string[] {
  if (!outranks(actor, target)) return [];
  return LIVE_ACTIONS.filter((action) => {
    if (action === 'SLAY') return atLeast(actor, SLAY_MIN_ROLE);
    // За бана бутонът се показва от MODERATOR нагоре; срокът се проверява при изпращане.
    return atLeast(actor, minRoleToPunish(action, action === 'BAN' ? 0 : null));
  });
}

export function dashboardRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/',
      cap: 'panel',
      handle: async (req, res) => {
        const principal = me(res);
        const { status, players } = await ctx.live.snapshot();
        const ids = (players ?? []).flatMap((player) => (player.steamId ? [player.steamId] : []));
        const roles = new Map(
          (
            await ctx.db.player.findMany({
              where: { steamId: { in: ids } },
              select: { steamId: true, role: true },
            })
          ).map((row) => [row.steamId, row.role]),
        );
        const [openReports, openAppeals] = await Promise.all([
          ctx.db.report.count({ where: { status: 'OPEN' } }),
          ctx.db.appeal.count({ where: { status: 'OPEN' } }),
        ]);
        renderAdmin(req, res, 'dashboard', {
          current: 'dashboard',
          status,
          players:
            players?.map((player) => {
              const role = (player.steamId && roles.get(player.steamId)) || 'PLAYER';
              return {
                ...player,
                name: displayName(player.name, player.steamId ?? '—'),
                dbRole: role,
                actions:
                  player.steamId && !player.isBot ? allowedActions(principal.role, role) : [],
              };
            }) ?? null,
          categories: BAN_CATEGORIES,
          units: DURATION_UNITS,
          modes: DM_MODES,
          openReports,
          openAppeals,
        });
      },
    },
    {
      method: 'post',
      path: '/live/action',
      cap: 'panel',
      handle: async (req, res) => {
        const principal = me(res);
        const body = liveActionBody.safeParse(req.body);
        if (!body.success) return done(res, '/admin', 'invalid');
        const { steamId, action, category } = body.data;
        const reason = body.data.reason ?? '';
        if (action === 'SLAY') {
          const denial = checkTargetAction(
            principal.role,
            SLAY_MIN_ROLE,
            await targetRole(ctx, steamId),
          );
          if (denial) return done(res, '/admin', denial === 'role' ? 'denied' : 'immune');
          const result = await ctx.bridge.send('slay', { steamId }, principal.steamId);
          await audit(ctx.db, {
            actor: principal.steamId,
            action: 'player.slay',
            target: steamId,
            details: { ok: result.ok, ...(result.ok ? {} : { error: result.error }) },
          });
          return done(
            res,
            '/admin',
            result.ok ? 'sent' : commandResultCode(commandErrorKey(result.error)),
          );
        }
        const duration = durationMs(body.data);
        if (duration === undefined) return done(res, '/admin', 'invalid');
        // Бан и заглушаване искат причина (вътрешна — само за админите); kick може и без.
        if (action !== 'KICK' && reason.length === 0) return done(res, '/admin', 'invalid');
        const code = await createPunishment(ctx, principal, {
          type: action satisfies PanelPunishType,
          steamId,
          category: category as PunishmentCategory,
          reason,
          durationMs: duration,
        });
        done(res, '/admin', code);
      },
    },
    {
      method: 'post',
      path: '/live/say',
      cap: 'say',
      handle: async (req, res) => {
        const principal = me(res);
        const body = sayBody.safeParse(req.body);
        if (!body.success) return done(res, '/admin', 'invalid');
        const result = await ctx.bridge.send('say', { text: body.data.text }, principal.steamId);
        await audit(ctx.db, {
          actor: principal.steamId,
          action: 'server.say',
          details: { text: body.data.text, ok: result.ok },
        });
        done(res, '/admin', result.ok ? 'sent' : commandResultCode(commandErrorKey(result.error)));
      },
    },
    {
      method: 'post',
      path: '/live/mode',
      cap: 'mode',
      handle: async (req, res) => {
        const principal = me(res);
        const body = modeBody.safeParse(req.body);
        if (!body.success || !DM_MODES.some((mode) => mode.id === body.data.modeId)) {
          return done(res, '/admin', 'invalid');
        }
        const result = await ctx.bridge.send(
          'mode',
          { modeId: body.data.modeId },
          principal.steamId,
        );
        await audit(ctx.db, {
          actor: principal.steamId,
          action: 'server.mode',
          details: { modeId: body.data.modeId, ok: result.ok },
        });
        done(res, '/admin', result.ok ? 'sent' : commandResultCode(commandErrorKey(result.error)));
      },
    },
  ];
}
