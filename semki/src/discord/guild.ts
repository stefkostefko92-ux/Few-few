// Гилдията през очите на бота: канали и роли за падащите менюта, правата на член, изпращане на известия.
import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
} from 'discord.js';
import type { MemberFacts } from '../domain/access.js';
import type { AlertSender } from '../services/notifier.js';

export interface NamedItem {
  id: string;
  name: string;
}

export interface GuildDirectory {
  ready(): boolean;
  channels(): NamedItem[];
  roles(): NamedItem[];
  memberFacts(userId: string): Promise<MemberFacts | null>;
}

const SENDABLE = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

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
        .map((c) => ({ id: c.id, name: `#${c.name}` }));
    },
    roles() {
      const g = guild();
      if (!g) return [];
      // Без @everyone и без управляваните (ролите на ботовете) — те не се тагват.
      return [...g.roles.cache.values()]
        .filter((r) => r.id !== g.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: `@${r.name}` }));
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

export function createAlertSender(client: Client, guildId: string): AlertSender {
  return {
    async send(channelId, roleId, content, ping = true) {
      const channel = await client.channels.fetch(channelId);
      if (
        !channel ||
        channel.isDMBased() ||
        channel.guildId !== guildId ||
        !SENDABLE.has(channel.type)
      ) {
        throw new Error(`каналът ${channelId} не е текстов канал в гилдията`);
      }
      if (!channel.isSendable()) throw new Error(`ботът не може да пише в ${channelId}`);
      // Тагва се само ролята на правилото — нищо друго от текста не пингва.
      await channel.send({ content, allowedMentions: { parse: [], roles: ping ? [roleId] : [] } });
    },
  };
}
