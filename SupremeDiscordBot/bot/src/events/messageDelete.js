// bot/src/events/messageDelete.js
// Server Event Logging — category "messages", action "message_delete".
// Actor best-effort от audit log (MessageDelete) — Discord пише запис там САМО
// когато трие ДРУГ потребител (модератор); самоизтриване няма actor.
// Partials.Message: изтрит стар пост извън кеша идва без автор/съдържание.

import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";
import { markTicketMessage } from "../utils/api.js";

function tagOf(user) {
  if (!user) return null;
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

export default {
  name: "messageDelete",
  once: false,
  async execute(message) {
    try {
      const guild = message.guild;
      if (!guild?.id) return;
      // Кеширан ботски пост (панел/анкета) — шум; при partial авторът е
      // неизвестен и пускаме лога (по-добре запис с "(unknown)", отколкото
      // сляпо петно за изтритото).
      if (message.author?.bot) return;

      // ── Одитна следа в ТИКЕТ транскрипта (v36) ──────────────────────────
      // Върви НЕЗАВИСИМО от Server Event Logging: изтриването не бива да е
      // начин да изчистиш следите си от одитния документ. Backend-ът връща
      // 204 за съобщения извън тикет канал. Съдържанието се запазва — само
      // се маркира като изтрито.
      markTicketMessage(message.id, "delete").catch(() => {});

      // Гейт ПРЕДИ скъпия audit fetch — иначе всяко изтрито съобщение във
      // всеки guild бие fetchAuditLogs дори с изключено логване (rate limit).
      if (!(await isEventCategoryEnabled(guild.id, "messages"))) return;

      const actor = message.author?.id
        ? await fetchAuditActor(guild, AuditLogEvent.MessageDelete, message.author.id)
        : null;

      const attachmentCount = message.attachments?.size || 0;

      await logServerEvent(message.client, guild, {
        category: "messages",
        action: "message_delete",
        targetId: message.author?.id || null,
        targetTag: tagOf(message.author),
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        channelId: message.channelId,
        metadata: {
          content: message.partial || message.content == null
            ? "(unknown — message was not cached)"
            : (message.content || "(no text content)"),
          ...(attachmentCount && { attachments: attachmentCount }),
        },
      });
    } catch (err) {
      console.warn(`[messageDelete] error: ${err?.message}`);
    }
  },
};
