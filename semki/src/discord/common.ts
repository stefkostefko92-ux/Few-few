// Общото между командите и компонентите: кой е човекът (права) и как се казва.
import {
  MessageFlags,
  PermissionFlagsBits,
  type BaseInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { canManageSeeds, type MemberFacts } from '../domain/access.js';
import { getSettings } from '../services/rules.js';

export const NO_PINGS = { parse: [] } as const;

export function memberFacts(i: BaseInteraction): MemberFacts | null {
  if (!i.inGuild()) return null;
  const roles = i.member.roles;
  return {
    isOwner: i.guild?.ownerId === i.user.id,
    isAdmin: i.memberPermissions.has(PermissionFlagsBits.Administrator),
    roleIds: Array.isArray(roles) ? roles : [...roles.cache.keys()],
  };
}

export function actorName(i: BaseInteraction): string {
  if (i.inCachedGuild()) return i.member.displayName;
  return i.user.globalName ?? i.user.username;
}

// Правото за въвеждане и триене — от ролята в настройките (или Administrator); иначе кратък отказ,
// видим само за човека.
export async function ensureManager(
  db: PrismaClient,
  i: ChatInputCommandInteraction | MessageComponentInteraction,
): Promise<boolean> {
  const settings = await getSettings(db);
  if (canManageSeeds(memberFacts(i), settings.commandRoleId)) return true;
  const need = settings.commandRoleId ? `ролята <@&${settings.commandRoleId}>` : 'администратор';
  await i.reply({
    content: `Нямаш права за тази команда — нужна е ${need}.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: NO_PINGS,
  });
  return false;
}
