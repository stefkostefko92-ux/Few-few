// bot/src/events/messageDeleteBulk.js
// Server Event Logging — category "messages", action "message_bulk_delete".
// Емитва се при purge (масово изтриване от модератор/бот). Не изброяваме
// съдържанието на N съобщения — логваме броя, канала и actor-а (audit log
// MessageBulkDelete пише КАНАЛА като target, не потребител).

import { logServerEvent, isEventCategoryEnabled } from "../utils/serverEventLog.js";
import { AuditLogEvent } from "discord.js";

export default {
  name: "messageDeleteBulk",
  once: false,
  async execute(messages, channel) {
    try {
      const guild = channel?.guild;
      if (!guild?.id) return;

      // Гейт ПРЕДИ скъпия audit fetch (виж messageDelete.js).
      if (!(await isEventCategoryEnabled(guild.id, "messages"))) return;

      // Actor best-effort: bulk-delete audit записът сочи канала, затова
      // не минаваме през fetchAuditActor (той сверява target user id).
      let actorId = null, actorTag = null;
      try {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 3 });
        const entry = logs.entries.find((e) => Date.now() - e.createdTimestamp <= 5000);
        if (entry?.executor) {
          actorId = entry.executor.id;
          actorTag = entry.executor.discriminator && entry.executor.discriminator !== "0"
            ? `${entry.executor.username}#${entry.executor.discriminator}`
            : entry.executor.username;
        }
      } catch { /* няма ViewAuditLog — пропускаме actor-а */ }

      await logServerEvent(channel.client, guild, {
        category: "messages",
        action: "message_bulk_delete",
        actorId,
        actorTag,
        channelId: channel.id,
        metadata: { count: messages?.size || 0 },
      });
    } catch (err) {
      console.warn(`[messageDeleteBulk] error: ${err?.message}`);
    }
  },
};
