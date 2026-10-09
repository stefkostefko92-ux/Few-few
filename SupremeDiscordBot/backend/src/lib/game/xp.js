// backend/src/lib/game/xp.js
// Server Season — ЕДНО определение за нивата, XP и искрите (docs/GAME_CONCEPT.md).
//
// Кривата е тази на MEE6/Arcane (хората я познават): за да минеш от ниво n на
// n+1 трябват 5n² + 50n + 100 XP. Ниво 1 = 100 XP, ниво 5 = 1 150, ниво 10 =
// 4 675, ниво 20 = 23 850 — измерено в ~15 XP на съобщение с 60 s охлаждане,
// тоест активен член стига ниво 10 за около месец. Всички числа са тук, за да
// може балансът да се сменя на едно място и гейтът (game.test.js) да го хване.
import { prisma } from "../prisma.js";

/** XP, нужни, за да минеш от ниво `level` на `level + 1`. */
export function xpForNextLevel(level) {
  const n = Math.max(0, Math.floor(level));
  return 5 * n * n + 50 * n + 100;
}

/** Общо XP, нужни за да СИ на ниво `level` (кумулативно). */
export function xpToReachLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForNextLevel(i);
  return total;
}

/** Нивото за дадено общо XP (0 при по-малко от 100). Таван 200 — защита от overflow при ръчни грешки. */
export function levelFromXp(xp) {
  let level = 0;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < 200) {
    const need = xpForNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  return level;
}

/** Напредък вътре в текущото ниво — за лентата в /profile. */
export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const base = xpToReachLevel(level);
  const need = xpForNextLevel(level);
  const into = Math.max(0, Math.floor(xp) - base);
  return { level, into, need, pct: Math.min(100, Math.floor((into / need) * 100)) };
}

// ─── Награди по събитие (XP) — еднократни по ключ (GameXpGrant) ─────────────
export const XP_REWARDS = Object.freeze({
  POLL_VOTE: 5,
  GIVEAWAY_ENTER: 10,
  APPLICATION_APPROVED: 50,
  TICKET_CLOSED_IN_SLA: 30, // за staff, който затваря без пробив на SLA
  VERIFIED: 20,
  TRIVIA_WIN: 25,
  COUNTING_MILESTONE: 15,
});

/** Кой еднократен ключ (префикс) е принос към кой сървърен куест (етап 3). */
export const QUEST_TYPE_BY_KEY_PREFIX = Object.freeze({ poll: "POLL_VOTES", verify: "VERIFICATIONS", ticket: "TICKETS_SLA" });

/** Искри при ниво нагоре: 10 на ниво, стига до 250 на ниво 25+ (не расте безкрайно). */
export function sparksForLevelUp(newLevel) {
  return Math.min(250, 10 * Math.max(1, newLevel));
}

// ─── /daily — чисти правила, тестваеми без база ─────────────────────────────
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;   // след толкова може пак
export const DAILY_STREAK_GRACE_MS = 48 * 60 * 60 * 1000; // до толкова streak-ът оцелява
export const DAILY_XP = 25;

/**
 * @param {{ lastDailyAt: Date|null, streak: number }} prev
 * @param {number} baseSparks  GameSettings.dailySparks
 * @param {Date} [now]
 * @returns {{ ok:false, retryInMs:number } | { ok:true, streak:number, sparks:number, xp:number, doubled:boolean }}
 */
export function computeDaily(prev, baseSparks, now = new Date()) {
  const last = prev.lastDailyAt ? new Date(prev.lastDailyAt).getTime() : 0;
  const since = now.getTime() - last;
  if (last && since < DAILY_WINDOW_MS) return { ok: false, retryInMs: DAILY_WINDOW_MS - since };
  const streak = last && since <= DAILY_STREAK_GRACE_MS ? (prev.streak || 0) + 1 : 1;
  const doubled = streak >= 7;
  const sparks = Math.max(1, Math.floor(baseSparks)) * (doubled ? 2 : 1);
  return { ok: true, streak, sparks, xp: DAILY_XP, doubled };
}

// ─── Записи в базата ─────────────────────────────────────────────────────────
/**
 * Гарантира реда с напредъка и го връща. INSERT … ON CONFLICT DO NOTHING
 * (createMany + skipDuplicates), не `upsert`: Prisma пуска upsert като
 * SELECT + INSERT и две едновременни първи събития за нов играч даваха P2002
 * (червен екип 25.09.2026) — а в транзакция това проваля цялата транзакция.
 * @param {object} db  prisma или tx
 */
export async function ensureProgress(db, serverId, userId) {
  await db.memberProgress.createMany({ data: [{ serverId, userId }], skipDuplicates: true });
  return db.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } } });
}

/** Настройките на играта за сървър — създава реда с подразбиранията, ако липсва. */
export async function getGameSettings(serverId) {
  const existing = await prisma.gameSettings.findUnique({ where: { serverId } });
  if (existing) return existing;
  // Сървър, който идва СЛЕД края на сезон, не го „затваря“ (фалшива обява за
  // сезон, в който не е играл, и нулиране на XP-то от новия — одит на Кодаджията 25.09.2026).
  const { latestEndedSeason } = await import("./seasons.js");
  const ended = await latestEndedSeason().catch(() => null);
  await prisma.gameSettings.createMany({ data: [{ serverId, lastSeasonId: ended?.code ?? null }], skipDuplicates: true });
  return prisma.gameSettings.findUnique({ where: { serverId } });
}

/**
 * Добавя XP (и сметнати искри при ниво нагоре). Връща какво се е случило, за да
 * може викащият (bot batch / събитие) да раздаде ролите и да обяви.
 *
 * БЕЗ загубени записи при едновременност (одит 24.09.2026): предишната версия
 * четеше реда и пишеше АБСОЛЮТНО `xp: row.xp + inc` — партидата от съобщения и
 * едновременна награда (анкета, trivia, куест) се презаписваха и XP се губеше.
 * Сега XP е атомарен `increment`, а нивото се вдига с условен updateMany по
 * видяното ниво (само един победител плаща искрите; при загубена надпревара —
 * повторно четене, до 3 опита).
 * @returns {Promise<{ userId:string, xp:number, level:number, oldLevel:number, leveledUp:boolean, sparksAwarded:number }>}
 */
export async function awardXp(serverId, userId, amount, { messages = 0, voiceMinutes = 0, touchMessageXp = false } = {}) {
  const inc = Math.max(0, Math.floor(amount));
  const key = { serverId_userId: { serverId, userId } };
  await ensureProgress(prisma, serverId, userId);
  let cur = await prisma.memberProgress.update({
    where: key,
    data: {
      xp: { increment: inc },
      seasonXp: { increment: inc },
      messages: { increment: messages },
      voiceMinutes: { increment: voiceMinutes },
      ...(touchMessageXp ? { lastMessageXpAt: new Date() } : {}),
    },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const oldLevel = cur.level;
    const newLevel = levelFromXp(cur.xp);
    if (newLevel <= oldLevel) return { userId, xp: cur.xp, level: oldLevel, oldLevel, leveledUp: false, sparksAwarded: 0 };
    let sparksAwarded = 0;
    for (let l = oldLevel + 1; l <= newLevel; l++) sparksAwarded += sparksForLevelUp(l);
    const won = await prisma.memberProgress.updateMany({
      where: { serverId, userId, level: oldLevel },
      data: { level: newLevel, sparks: { increment: sparksAwarded } },
    });
    if (won.count === 1) return { userId, xp: cur.xp, level: newLevel, oldLevel, leveledUp: true, sparksAwarded };
    // Друг запис е вдигнал нивото междувременно — прочети наново и довърши разликата.
    cur = await prisma.memberProgress.findUnique({ where: key });
    if (!cur) break;
  }
  return { userId, xp: cur?.xp ?? inc, level: cur?.level ?? 0, oldLevel: cur?.level ?? 0, leveledUp: false, sparksAwarded: 0 };
}

/**
 * Еднократна XP награда по ключ (напр. "poll:<id>"). Повторно извикване със
 * същия ключ не дава нищо — така toggle (гласувай/оттегли/гласувай) не фермва.
 * @returns {Promise<null | Awaited<ReturnType<typeof awardXp>>>}
 */
export async function grantXpOnce(serverId, userId, key, amount) {
  const settings = await prisma.gameSettings.findUnique({ where: { serverId }, select: { enabled: true } });
  if (!settings?.enabled) return null;
  try {
    await prisma.gameXpGrant.create({ data: { serverId, userId, key, amount } });
  } catch (err) {
    if (err?.code === "P2002") return null; // вече дадено
    throw err;
  }
  const r = await awardXp(serverId, userId, amount);
  // Етап 3: същото събитие е и принос към сървърния куест от този тип (веднъж —
  // ключът вече е спрял повторението). Динамичен import: questOps тегли този модул.
  const questType = QUEST_TYPE_BY_KEY_PREFIX[key.split(":")[0]];
  if (questType) {
    try {
      const { contribute } = await import("./questOps.js");
      await contribute(serverId, questType, [{ userId, amount: 1 }]);
    } catch { /* куестът е страничен ефект — XP-то вече е дадено */ }
  }
  // Ниво нагоре от събитие в backend-а (анкета, подарък, кандидатура, тикет,
  // верификация): ботът трябва да даде ролите и да обяви — той не вижда тази
  // партида. Динамичен import — botNotifier не бива да се тегли в чистите тестове.
  if (r.leveledUp) {
    try {
      const full = await prisma.gameSettings.findUnique({ where: { serverId } });
      const { notifyBot } = await import("../../services/botNotifier.js");
      await notifyBot("GAME_LEVEL_UP", {
        serverId, ...r, roleIds: rolesForLevel(full?.levelRoles, r.level),
        announceChannelId: full?.announceChannelId || null, levelUpMessage: full?.levelUpMessage !== false,
      });
    } catch { /* ботът може да е недостъпен — ролята ще дойде при следващото ниво/партида */ }
  }
  return r;
}

/** Ролите, които се полагат за ниво ≤ level (натрупващи се). */
export function rolesForLevel(levelRoles, level) {
  if (!Array.isArray(levelRoles)) return [];
  return levelRoles.filter((r) => Number(r?.level) <= level && /^\d{17,20}$/.test(String(r?.roleId || ""))).map((r) => String(r.roleId));
}

/**
 * Staff, затворил тикет без пробив на SLA, получава XP — само ако панелът
 * изобщо има SLA (иначе „в SLA" е празно твърдение), затварящият не е
 * създателят на тикета (сам си затваряш ≠ работа) и не е бот/липсва.
 */
export async function awardTicketSlaXp(ticket, closedById) {
  if (!ticket || !closedById || !ticket.serverId) return null;
  if (String(closedById) === String(ticket.creatorId)) return null;
  const panel = ticket.panel || {};
  if (!panel.slaFirstResponseMinutes && !panel.slaResolutionMinutes) return null;
  if (ticket.slaBreachedAt || ticket.slaResolutionBreachedAt) return null;
  return grantXpOnce(ticket.serverId, String(closedById), `ticket:${ticket.id}`, XP_REWARDS.TICKET_CLOSED_IN_SLA);
}
