// bot/src/events/messageDeleteBulk.js
// Server Event Logging — category "messages", action "message_bulk_delete".
// Емитва се при purge (масово изтриване от модератор/бот). Не изброяваме
// съдържанието на N съобщения — логваме броя, канала и actor-а (audit log
// MessageBulkDelete пише КАНАЛА като target, не потребител).

import { logServerEvent, isEventCategoryEnabled } from "../utils/serverEventLog.js";
import { AuditLogEvent } from "discord.js";
import { markTicketMessage } from "../utils/api.js";

export default {
  name: "messageDeleteBulk",
  once: false,
  async execute(messages, channel) {
    try {
      const guild = channel?.guild;
      if (!guild?.id) return;

      // Одитна следа в ТИКЕТ транскрипта — независимо от Server Event Logging.
      // messageDelete прави точно това от v36; масовото изтриване го НЕ правеше,
      // тоест `/purge` в тикет канал беше начин да изчистиш следите си от
      // одитния документ: транскриптът продължаваше да твърди, че съобщенията
      // съществуват. Backend-ът връща 204 за съобщения извън тикет канал.
      //
      // Discord ограничава bulk delete до 100 съобщения, затова цикълът е
      // ограничен по конструкция. Пращаме ги последователно и НЕ чакаме —
      // маркирането е странична функция и не бива да бави handler-а.
      // (Разбивача, 07.08.2026)
      for (const id of (messages?.keys?.() ?? [])) {
        markTicketMessage(id, "delete").catch(() => {});
      }

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
