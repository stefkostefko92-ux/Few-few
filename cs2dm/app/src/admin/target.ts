import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { parseSteamId } from '../steamid.js';
import type { AdminCtx } from './context.js';
import { outranks } from './rbac.js';

export type TargetResult =
  | { ok: true; steamId: string; role: Role }
  | { ok: false; steamId: string | null; code: 'notFound' | 'immune' };

/**
 * Целта от адреса (`:steamId`) + immunity (§1): само играч с по-ниско ниво от вписания. Проверката е
 * ПРЕДИ всеки запис и подпис — общо за действията върху играч от профила му. `self` (SteamID-ът на
 * вписания) пуска и действие върху самия него — само за VIP, което е козметика, не власт (§1).
 */
export async function findTarget(
  ctx: AdminCtx,
  req: Request,
  actor: Role,
  self?: string,
): Promise<TargetResult> {
  const steamId = parseSteamId(req.params.steamId);
  if (!steamId) return { ok: false, steamId: null, code: 'notFound' };
  const player = await ctx.db.player.findUnique({ where: { steamId }, select: { role: true } });
  if (!player) return { ok: false, steamId, code: 'notFound' };
  if (steamId !== self && !outranks(actor, player.role))
    return { ok: false, steamId, code: 'immune' };
  return { ok: true, steamId, role: player.role };
}

export const profilePath = (steamId: string) => `/admin/players/${steamId}`;

/** Къде да се върне отказът: профилът, ако SteamID-ът е валиден, иначе списъкът. */
export function failurePath(result: Extract<TargetResult, { ok: false }>): string {
  return result.steamId ? profilePath(result.steamId) : '/admin/players';
}
