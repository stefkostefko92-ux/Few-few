// bot/src/utils/ticketLog.js
// Лог на тикет събития + парсване на цвят. Изнесени от interactionCreate.js, за да
// ги ползват и ticketLifecycle.js / formSession.js без цикличен импорт.
import { BRAND } from "./colors.js";

export function parseColor(hex) {
  if (!hex) return BRAND;
  const clean = String(hex).replace("#", "");
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n : BRAND;
}

export async function logTicketEvent(guild, logChannelId, eventType, data) {
  const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel) return;

  const { ticketNumber, padding = 4, channel, user, actor, reason, color, extra } = data;
  const ticketTag = `#${String(ticketNumber ?? "").padStart(padding, "0")}`;

  const icons = {
    OPEN:       "🎫",
    CLOSE:      "🔒",
    REOPEN:     "🔓",
    CLAIM:      "👋",
    UNCLAIM:    "✋",
    DELETE:     "🗑️",
    RENAME:     "✏️",
    TRANSCRIPT: "📜",
  };

  const lines = [
    channel ? `**Channel**: ${channel}` : null,
    user ? `**User**: <@${user.id}>${user.username ? ` (${user.username})` : ""}` : null,
    actor && (!user || actor.id !== user.id) ? `**By**: <@${actor.id}>` : null,
    reason ? `**Reason**: ${reason}` : null,
    extra ? `**Info**: ${extra}` : null,
  ].filter(Boolean).join("\n");

  await logChannel.send({
    embeds: [{
      title: `${icons[eventType] || "ℹ️"} Ticket ${eventType} · ${ticketTag}`,
      description: lines,
      color: color ?? BRAND,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {});
}
