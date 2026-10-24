import type { PunishmentCategory, Role } from '@prisma/client';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import { commandErrorKey, type CommandSender } from './commands.js';
import { commandResultCode, type ResultCode } from './forms.js';
import {
  checkTargetAction,
  minRoleToPunish,
  minRoleToRevoke,
  type PanelPunishType,
} from './rbac.js';
import type { AdminCtx } from './context.js';
import type { AdminPrincipal } from './types.js';

/**
 * Наказанията от панела. Редът е винаги: право по ролята → immunity → запис в базата + одит в
 * ЕДНА транзакция (`source = WEB`) → команда по моста (§5) само ако играчът е онлайн. Базата е
 * истината: ако мостът не потвърди, наказанието остава записано (плъгинът опреснява на 60 s и при
 * влизане), а човекът вижда предупреждение.
 */
export interface PunishInput {
  type: PanelPunishType;
  steamId: string;
  /** Името при първо записване на непознат играч (офлайн, никога не е влизал). */
  name?: string;
  category: PunishmentCategory;
  reason: string;
  /** null = завинаги; за KICK и WARN не се ползва (срокът е „сега“, като в играта). */
  durationMs: number | null;
}

export async function targetRole(ctx: AdminCtx, steamId: string): Promise<Role> {
  const found = await ctx.db.player.findUnique({ where: { steamId }, select: { role: true } });
  return found?.role ?? 'PLAYER';
}

export async function isOnline(ctx: AdminCtx, steamId: string): Promise<boolean> {
  const { players } = await ctx.live.snapshot();
  return players?.some((player) => player.steamId === steamId) ?? false;
}

async function command(
  sender: CommandSender,
  action: string,
  args: Record<string, string | number>,
  actor: string,
): Promise<ResultCode | null> {
  const result = await sender.send(action, args, actor);
  if (result.ok) return null;
  logger.warn({ action, error: commandErrorKey(result.error) }, 'панел: командата не е потвърдена');
  return commandResultCode(commandErrorKey(result.error));
}

export async function createPunishment(
  ctx: AdminCtx,
  actor: AdminPrincipal,
  input: PunishInput,
): Promise<ResultCode> {
  const instant = input.type === 'KICK' || input.type === 'WARN';
  const minimum = minRoleToPunish(input.type, instant ? 0 : input.durationMs);
  const denial = checkTargetAction(actor.role, minimum, await targetRole(ctx, input.steamId));
  if (denial) return denial === 'role' ? 'denied' : 'immune';

  const online = await isOnline(ctx, input.steamId);
  // Изритване на човек, който не е в сървъра, няма какво да направи — не се записва.
  if (input.type === 'KICK' && !online) return 'cmdNotOnline';

  const now = ctx.now();
  const expiresAt = instant
    ? now
    : input.durationMs === null
      ? null
      : new Date(now.getTime() + input.durationMs);
  const fallbackName = (input.name ?? input.steamId).slice(0, 64);
  const punishmentId = await ctx.db.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { steamId: input.steamId },
      create: { steamId: input.steamId, name: fallbackName },
      update: {},
      select: { name: true },
    });
    const created = await tx.punishment.create({
      data: {
        type: input.type,
        steamId: input.steamId,
        targetName: player.name.slice(0, 64),
        category: input.category,
        reason: input.reason,
        expiresAt,
        actorSteamId: actor.steamId,
        source: 'WEB',
        createdAt: now,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor: actor.steamId,
      action: `punishment.${input.type.toLowerCase()}`,
      target: input.steamId,
      details: {
        punishmentId: created.id,
        category: input.category,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });
    return created.id;
  });

  if (!online) return 'saved';
  if (input.type === 'WARN') return 'saved';
  const failed =
    input.type === 'KICK'
      ? await command(
          ctx.bridge,
          'kick',
          { steamId: input.steamId, reason: input.reason },
          actor.steamId,
        )
      : await command(ctx.bridge, 'punish', { punishmentId }, actor.steamId);
  return failed ? 'recordedNoAck' : 'sent';
}

/** Отмяна (unban, unmute…): право за вида + immunity; само активно наказание. */
export async function revokePunishment(
  ctx: AdminCtx,
  actor: AdminPrincipal,
  punishmentId: number,
  reason: string,
  extra?: { appealId: number; note: string; status: 'ACCEPTED' },
): Promise<ResultCode> {
  const found = await ctx.db.punishment.findUnique({
    where: { id: punishmentId },
    select: {
      type: true,
      steamId: true,
      revokedAt: true,
      expiresAt: true,
      target: { select: { role: true } },
    },
  });
  if (!found) return 'notFound';
  const now = ctx.now();
  if (found.revokedAt || (found.expiresAt && found.expiresAt.getTime() <= now.getTime())) {
    return 'notActive';
  }
  const denial = checkTargetAction(actor.role, minRoleToRevoke(found.type), found.target.role);
  if (denial) return denial === 'role' ? 'denied' : 'immune';

  const revoked = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.punishment.updateMany({
      where: { id: punishmentId, revokedAt: null },
      data: { revokedAt: now, revokedBy: actor.steamId, revokeReason: reason.slice(0, 255) },
    });
    if (updated.count !== 1) return false;
    if (extra) {
      const decided = await tx.appeal.updateMany({
        where: { id: extra.appealId, status: 'OPEN' },
        data: {
          status: extra.status,
          handledAt: now,
          handledBy: actor.steamId,
          decisionNote: extra.note,
        },
      });
      if (decided.count !== 1) throw new AppealAlreadyDecided();
      await audit(tx, {
        actor: actor.steamId,
        action: 'appeal.decide',
        target: found.steamId,
        details: { appealId: extra.appealId, status: extra.status, punishmentId },
      });
    }
    await audit(tx, {
      actor: actor.steamId,
      action: 'punishment.revoke',
      target: found.steamId,
      details: { punishmentId, type: found.type },
    });
    return true;
  });
  if (!revoked) return 'notActive';
  if (!(await isOnline(ctx, found.steamId))) return 'saved';
  const failed = await command(ctx.bridge, 'revoke', { punishmentId }, actor.steamId);
  return failed ? 'recordedNoAck' : 'sent';
}

/** Обжалването е решено междувременно от друг — транзакцията се връща изцяло. */
export class AppealAlreadyDecided extends Error {
  constructor() {
    super('обжалването вече е решено');
  }
}
