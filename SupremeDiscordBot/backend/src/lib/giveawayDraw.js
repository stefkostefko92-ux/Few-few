// backend/src/lib/giveawayDraw.js
// Тегленето на победители (А4): печелят само хора, които още са в сървъра.
//
// ДЕФЕКТЪТ (одит 12.11.2026): при тегленето нито ролите, нито членството се
// проверяваха отново — печелеше и участник, напуснал сървъра. Backend-ът не
// знае кой е в Discord сървъра, затова пита БОТА (`/internal/giveaway-members-check`)
// за пакет кандидати, след справедливо разбъркване (Fisher–Yates), и взима
// първите `winnerCount` присъстващи.
//
// Fail-open САМО за недостъпен бот: ботът офлайн не бива да блокира приключването
// (cron-ът вече е записал endedAt), а преди тази поправка нямаше никакъв филтър.
import { pickRandom } from "./shuffle.js";
import { notifyBot } from "../services/botNotifier.js";

const BATCH = 50;

/** Set от присъстващите userId, или null = не мога да разбера (бот офлайн / непозната команда). */
export async function botMembership(serverId, userIds) {
  try {
    const r = await notifyBot("GIVEAWAY_MEMBERS_CHECK", { serverId, userIds });
    if (r && Array.isArray(r.present)) return new Set(r.present.map(String));
  } catch { /* fail-open по-долу */ }
  return null;
}

/**
 * @param {{ serverId: string, winnerCount: number, winnerIds?: string[] }} giveaway
 * @param {Array<{ userId: string }>} entries
 * @param {{ reroll?: boolean, isPresent?: (serverId: string, ids: string[]) => Promise<Set<string>|null> }} [o]
 * @returns {Promise<string[]>} победителите
 */
export async function drawWinners(giveaway, entries, { reroll = false, isPresent = botMembership } = {}) {
  const prev = new Set(reroll ? giveaway.winnerIds ?? [] : []);
  const pool = entries.filter((e) => !prev.has(e.userId));
  const shuffled = pickRandom(pool, pool.length).map((e) => e.userId);
  const winners = [];
  for (let i = 0; i < shuffled.length && winners.length < giveaway.winnerCount; i += BATCH) {
    const chunk = shuffled.slice(i, i + BATCH);
    const present = await isPresent(giveaway.serverId, chunk);
    for (const id of chunk) {
      if (winners.length >= giveaway.winnerCount) break;
      if (present === null || present.has(id)) winners.push(id);
    }
  }
  return winners;
}
