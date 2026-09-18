// backend/src/lib/game/season.js
// v50 — Server Season, етап 4: краят на сезона. Сезонът е константа в
// companions.js (CURRENT_SEASON — старт, край, сезонни спътници); след края
// дневната задача game-season за всеки сървър с играта: взима топ 3 по сезонно
// XP, нулира seasonXp (нивата, искрите и спътниците ОСТАВАТ — concept §6.4),
// маркира lastSeasonId (идемпотентно — условен updateMany, веднъж на сезон) и
// казва на бота да обяви. Нов сезон = нова CURRENT_SEASON в кода (release).
import { prisma } from "../prisma.js";
import { CURRENT_SEASON } from "./companions.js";

export function seasonEnded(now = new Date(), season = CURRENT_SEASON) {
  return now >= new Date(season.endsAt);
}

/** @returns {Promise<{ closed:number, ended:boolean }>} */
export async function closeSeasonIfEnded(now = new Date(), season = CURRENT_SEASON) {
  if (!seasonEnded(now, season)) return { closed: 0, ended: false };
  const notYet = { OR: [{ lastSeasonId: null }, { lastSeasonId: { not: season.id } }] };
  const servers = (await prisma.gameSettings.findMany({ where: { enabled: true, ...notYet }, select: { serverId: true, announceChannelId: true }, take: 500 })) || [];
  let closed = 0;
  for (const s of servers) {
    const top = (await prisma.memberProgress.findMany({ where: { serverId: s.serverId, seasonXp: { gt: 0 } }, orderBy: [{ seasonXp: "desc" }, { updatedAt: "asc" }], take: 3, select: { userId: true, seasonXp: true, level: true } })) || [];
    const claim = await prisma.gameSettings.updateMany({ where: { serverId: s.serverId, ...notYet }, data: { lastSeasonId: season.id } });
    if (claim.count !== 1) continue; // друг процес вече затвори този сървър
    await prisma.memberProgress.updateMany({ where: { serverId: s.serverId }, data: { seasonXp: 0 } });
    try {
      const { notifyBot } = await import("../../services/botNotifier.js");
      await notifyBot("GAME_SEASON_END", { serverId: s.serverId, season: { id: season.id, name: season.name }, top, announceChannelId: s.announceChannelId || null });
    } catch { /* обявата е страничен ефект — нулирането вече е записано */ }
    closed++;
  }
  return { closed, ended: true };
}
