// Гилдията през очите на бота: канали и роли за падащите менюта, правата на член, изпращане на известия.
import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import type { MemberFacts } from '../domain/access.js';
import type { AlertSender } from '../services/notifier.js';

export interface NamedItem {
  id: string;
  name: string;
}

// `usable`: каналът — ботът го вижда и пише в него; ролята — тагът ѝ наистина пингва (ролята е
// „mentionable“ или ботът има Mention Everyone). Иначе Discord пуска съобщението без известие.
export interface GuildItem extends NamedItem {
  usable: boolean;
}

export interface GuildDirectory {
  ready(): boolean;
  channels(): GuildItem[];
  roles(): GuildItem[];
  memberFacts(userId: string): Promise<MemberFacts | null>;
}

const SENDABLE = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const CHANNEL_PERMS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

function canWrite(g: Guild, channel: GuildBasedChannel): boolean {
  const me = g.members.me;
  return me !== null && (channel.permissionsFor(me)?.has(CHANNEL_PERMS) ?? false);
}

function canPing(g: Guild, roleId: string): boolean {
  const role = g.roles.cache.get(roleId);
  if (!role) return false;
  return (
    role.mentionable ||
    (g.members.me?.permissions.has(PermissionFlagsBits.MentionEveryone) ?? false)
  );
}

export function createGuildDirectory(client: Client, guildId: string): GuildDirectory {
  function guild(): Guild | undefined {
    return client.guilds.cache.get(guildId);
  }

  return {
    ready: () => client.isReady() && guild() !== undefined,
    channels() {
      const g = guild();
      if (!g) return [];
      return [...g.channels.cache.values()]
        .filter((c) => SENDABLE.has(c.type))
        .sort((a, b) =>
          'rawPosition' in a && 'rawPosition' in b ? a.rawPosition - b.rawPosition : 0,
        )
        .map((c) => ({ id: c.id, name: `#${c.name}`, usable: canWrite(g, c) }));
    },
    roles() {
      const g = guild();
      if (!g) return [];
      // Без @everyone и без управляваните (ролите на ботовете) — те не се тагват.
      return [...g.roles.cache.values()]
        .filter((r) => r.id !== g.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: `@${r.name}`, usable: canPing(g, r.id) }));
    },
    async memberFacts(userId) {
      const g = guild();
      if (!g) return null;
      try {
        // force: без привилегирования GuildMembers intent кешът не научава за смяна на роли.
        const m = await g.members.fetch({ user: userId, force: true });
        return {
          isOwner: g.ownerId === userId,
          isAdmin: m.permissions.has(PermissionFlagsBits.Administrator),
          roleIds: [...m.roles.cache.keys()],
        };
      } catch (err) {
        if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownMember)
          return null;
        throw err;
      }
    },
  };
}

// Изпращането пада с ясна грешка, ако ботът не може да пише в канала или тагът не би пингнал:
// иначе двойката (партида, правило) се води известена, а никой не е получил известие.
export function createAlertSender(client: Client, guildId: string): AlertSender {
  return {
    async send(channelId, roleId, content, ping = true) {
      const g = client.guilds.cache.get(guildId);
      const channel = g?.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));
      if (
        !g ||
        !channel ||
        channel.isDMBased() ||
        channel.guildId !== guildId ||
        !SENDABLE.has(channel.type)
      ) {
        throw new Error(`каналът ${channelId} не е текстов канал в гилдията`);
      }
      if (!channel.isSendable() || !canWrite(g, channel)) {
        throw new Error(`ботът няма View Channel и Send Messages в ${channelId}`);
      }
      if (ping && !canPing(g, roleId)) {
        throw new Error(
          `ролята ${roleId} не може да бъде тагната: не е mentionable, а ботът няма Mention Everyone`,
        );
      }
      // Тагва се само ролята на правилото — нищо друго от текста не пингва.
      await channel.send({ content, allowedMentions: { parse: [], roles: ping ? [roleId] : [] } });
    },
  };
}
