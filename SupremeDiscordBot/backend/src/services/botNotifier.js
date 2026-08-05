// backend/src/services/botNotifier.js
import axios from "axios";

/**
 * Send an event notification to the Discord bot's internal HTTP server.
 * The bot listens on its own port for these webhook-style events.
 * Env vars are read lazily inside the function to ensure dotenv has loaded.
 */
export async function notifyBot(event, data) {
  const BOT_API_URL = process.env.BOT_API_URL || "http://bot:3001"; // docker service name
  const API_SECRET = process.env.API_SECRET;

  if (!API_SECRET) {
    console.error("notifyBot: API_SECRET not set — cannot communicate with bot");
    return null;
  }

  try {
    const res = await axios.post(
      `${BOT_API_URL}/internal/${event.toLowerCase().replace(/_/g, "-")}`,
      data,
      {
        headers: { "x-bot-secret": API_SECRET },
        timeout: 10000,
      }
    );
    return res.data;
  } catch (err) {
    // Log but don't crash — bot might be temporarily offline
    console.error(`Failed to notify bot of event [${event}]:`, err?.response?.data || err.message);
    return null;
  }
}

/**
 * Изпраща лично съобщение (DM) до Discord потребител през бота.
 * Продуктът няма имейл инфраструктура → това е каналът за транзакционни
 * известия по абонамента (изтичащ пробен период, провалено плащане).
 *
 * Ползва СЪЩИЯ вътрешен канал като notifyBot (x-bot-secret / API_SECRET) —
 * не въвежда нов secret.
 *
 * Връща:
 *   { ok: true }                      — доставено
 *   { ok: false, reason: "..." }      — ТРАЙНА пречка (DM затворен, блокиран
 *                                       бот, непознат потребител) → няма смисъл
 *                                       от повторен опит
 *   null                              — ВРЕМЕНЕН провал (ботът е недостъпен,
 *                                       timeout, 5xx) → повикващият може да
 *                                       опита пак по-късно
 * Никога не хвърля — известието е страничен ефект, не бизнес-ефект.
 *
 * @param {string} userId Discord user ID (снежинка)
 * @param {object} embed  Discord embed обект (title/description/color/fields…)
 */
export async function dmUser(userId, embed) {
  if (!userId || !embed) return { ok: false, reason: "missing_userId_or_embed" };
  return notifyBot("DM_USER", { userId, embed });
}

/**
 * Публикува отговор от dashboard-а в Discord тикет канала — ботът праща embed
 * от името на staff члена („Име · via dashboard"), без staff-ът да влиза в
 * Discord. Ползва СЪЩИЯ вътрешен канал като notifyBot (x-bot-secret).
 *
 * Връща:
 *   { ok: true, messageId }      — доставено в канала
 *   { ok: false, reason: "..." } — ботът отказа (несъществуващ канал и т.н.)
 *   null                         — ботът е недостъпен (timeout, 5xx, мрежа)
 * Никога не хвърля — повикващият решава как да докладва провала.
 *
 * @param {object} p
 * @param {string} p.channelId  Discord channel/thread ID на тикета
 * @param {string} p.content    Изчистеният текст на отговора (без mass mentions)
 * @param {string} p.authorName Показвано име на staff члена
 * @param {string} p.authorId   Discord user ID на staff члена (за одит в бота)
 * @param {string} p.ticketId   Ticket ID (за логове)
 * @param {number} [p.number]   Пореден номер на тикета (за footer „Ticket #N")
 */
export async function sendTicketReply({ channelId, content, authorName, authorId, ticketId, number }) {
  if (!channelId || !content) return { ok: false, reason: "missing_channelId_or_content" };
  return notifyBot("TICKET_REPLY", { channelId, content, authorName, authorId, ticketId, number });
}
