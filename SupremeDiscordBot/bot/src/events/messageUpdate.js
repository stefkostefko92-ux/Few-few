// bot/src/events/messageUpdate.js
// Server Event Logging — category "messages", action "message_edit".
// Изисква GuildMessages + MessageContent intents и Partials.Message (стар
// пост извън кеша идва partial — тогава старото съдържание е неизвестно).
// Закача се и на white-label клиентите (clientManager.loadEventModules).

import { logServerEvent, isEventCategoryEnabled } from "../utils/serverEventLog.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

export default {
  name: "messageUpdate",
  once: false,
  async execute(oldMessage, newMessage) {
    try {
      // Евтин гейт ПРЕДИ REST fetch-а — иначе всяка редакция във всеки guild
      // дърпа съобщението дори с изключено логване (Кодаджията). guildId е
      // наличен и на partial съобщение.
      const guildId = newMessage.guildId || newMessage.guild?.id;
      if (!guildId) return;
      if (!(await isEventCategoryEnabled(guildId, "messages"))) return;

      // Partial НОВО съобщение → дръпни го (без него няма какво да логнем).
      if (newMessage.partial) {
        newMessage = await newMessage.fetch().catch(() => null);
        if (!newMessage) return;
      }
      const guild = newMessage.guild;
      if (!guild?.id) return;
      if (newMessage.author?.bot) return; // ботски embeds (панели/анкети) шумят

      const before = oldMessage?.partial ? null : (oldMessage?.content ?? null);
      const after = newMessage.content ?? "";

      // Discord емитва messageUpdate и при добавен link preview / embed —
      // съдържанието е същото → не е редакция, не логваме шум.
      if (before !== null && before === after) return;

      await logServerEvent(newMessage.client, guild, {
        category: "messages",
        action: "message_edit",
        targetId: newMessage.author?.id || null,
        targetTag: tagOf(newMessage.author),
        channelId: newMessage.channelId,
        metadata: {
          before: before ?? "(unknown — message was not cached)",
          after,
          messageUrl: newMessage.url,
        },
      });
    } catch (err) {
      console.warn(`[messageUpdate] error: ${err?.message}`);
    }
  },
};
