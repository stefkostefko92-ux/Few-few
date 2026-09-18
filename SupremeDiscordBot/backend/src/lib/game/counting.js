// backend/src/lib/game/counting.js
// v50 — Server Season, етап 3: Counting. Стандартната логика (Counting bot):
// следващото число трябва да е точно current + 1, същият човек не брои два пъти
// подред, грешка = рестарт от 1, сървърът пази рекорд. На всеки 100 — XP
// (COUNTING_MILESTONE, еднократно по ключ). Backend-ът е съдията — условният
// updateMany прави две едновременни „5“ да минат само веднъж.
//
// Съдържанието на съобщението се чете САМО в канала, който операторът е обявил
// за counting (GameSettings.countingChannelId) — същият модел като тикет
// каналите (docs/DISCORD_VERIFICATION.md).
import { prisma } from "../prisma.js";
import { getGameSettings, grantXpOnce, XP_REWARDS } from "./xp.js";

export const COUNTING_MILESTONE_EVERY = 100;
export const COUNTING_MAX = 999_999_999;

/** Само цяло положително число, нищо друго (без „5!“, „five“, „5 + 0“). */
export function parseCount(content) {
  const m = /^\s*(\d{1,9})\s*$/.exec(String(content ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= COUNTING_MAX ? n : null;
}

/**
 * @returns {Promise<
 *   { ok:true, number:number, high:number, record:boolean, milestone:boolean, xp:number } |
 *   { ok:false, code:"COUNTING_DISABLED"|"WRONG_NUMBER"|"SAME_USER"|"RACE", expected?:number, reached?:number, high?:number }>}
 */
export async function applyCount(serverId, userId, number) {
  const s = await getGameSettings(serverId);
  if (!s.enabled || !s.countingChannelId) return { ok: false, code: "COUNTING_DISABLED" };
  const expected = s.countingCurrent + 1;
  if (number !== expected || (s.countingLastUserId && s.countingLastUserId === userId)) {
    // Рестарт — но само ако редът е още там, където го видяхме (иначе друг вече е броил/рестартирал).
    await prisma.gameSettings.updateMany({
      where: { serverId, countingCurrent: s.countingCurrent },
      data: { countingCurrent: 0, countingLastUserId: null },
    });
    return { ok: false, code: number !== expected ? "WRONG_NUMBER" : "SAME_USER", expected, reached: s.countingCurrent, high: s.countingHigh };
  }
  const moved = await prisma.gameSettings.updateMany({
    where: { serverId, countingCurrent: number - 1 },
    data: { countingCurrent: number, countingLastUserId: userId },
  });
  if (moved.count !== 1) return { ok: false, code: "RACE", expected, high: s.countingHigh };
  const record = number > s.countingHigh;
  if (record) await prisma.gameSettings.updateMany({ where: { serverId, countingHigh: { lt: number } }, data: { countingHigh: number } });
  const milestone = number % COUNTING_MILESTONE_EVERY === 0;
  let xp = 0;
  if (milestone) {
    const r = await grantXpOnce(serverId, userId, `counting:${number}`, XP_REWARDS.COUNTING_MILESTONE).catch(() => null);
    if (r) xp = XP_REWARDS.COUNTING_MILESTONE;
  }
  return { ok: true, number, high: Math.max(number, s.countingHigh), record, milestone, xp };
}
