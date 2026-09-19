// backend/src/lib/game/season.js
// v50 — Server Season, етап 4: краят на сезона. Сезоните са в базата
// (lib/game/seasons.js, управлявани от админ конзолата). Дневната задача
// game-season взима последния ПРИКЛЮЧИЛ сезон и за всеки сървър с играта,
// който още не го е затворил (lastSeasonId ≠ кода): топ 3 по сезонно XP →
// бота за обява, seasonXp → 0 (нивата, искрите и спътниците ОСТАВАТ —
// concept §6.4), lastSeasonId = кода (идемпотентно — условен updateMany).
import { prisma } from "../prisma.js";
import { latestEndedSeason } from "./seasons.js";

export function seasonEnded(now = new Date(), season) {
  return !!season && now >= new Date(season.endsAt);
}

/** @returns {Promise<{ closed:number, ended:boolean, code?:string }>} */
export async function closeSeasonIfEnded(now = new Date(), season = null) {
  const target = season || await latestEndedSeason(now);
  if (!seasonEnded(now, target)) return { closed: 0, ended: false };
  const notYet = { OR: [{ lastSeasonId: null }, { lastSeasonId: { not: target.code } }] };
  const servers = (await prisma.gameSettings.findMany({ where: { enabled: true, ...notYet }, select: { serverId: true, announceChannelId: true }, take: 500 })) || [];
  let closed = 0;
  for (const s of servers) {
    const top = (await prisma.memberProgress.findMany({ where: { serverId: s.serverId, seasonXp: { gt: 0 } }, orderBy: [{ seasonXp: "desc" }, { updatedAt: "asc" }], take: 3, select: { userId: true, seasonXp: true, level: true } })) || [];
    const claim = await prisma.gameSettings.updateMany({ where: { serverId: s.serverId, ...notYet }, data: { lastSeasonId: target.code } });
    if (claim.count !== 1) continue; // друг процес вече затвори този сървър
    await prisma.memberProgress.updateMany({ where: { serverId: s.serverId }, data: { seasonXp: 0 } });
    try {
      const { notifyBot } = await import("../../services/botNotifier.js");
      await notifyBot("GAME_SEASON_END", { serverId: s.serverId, season: { id: target.code, name: target.name }, top, announceChannelId: s.announceChannelId || null });
    } catch { /* обявата е страничен ефект — нулирането вече е записано */ }
    closed++;
  }
  return { closed, ended: true, code: target.code };
}
