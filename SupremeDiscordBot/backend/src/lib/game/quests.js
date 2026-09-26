// backend/src/lib/game/quests.js
// v50 — Server Season, етап 3: СЪРВЪРНИТЕ КУЕСТОВЕ — чистите правила (без база).
// Сървърът играе като отбор: седмична цел („3 000 съобщения“, „40 гласа в
// анкети“), всеки принос се брои, постигне ли се — всеки принесъл взима искри,
// а най-големият принос отваря сандък (×2 + спътник). Механиката на Counting/
// Arcane goal counters (docs/GAME_CONCEPT.md §2.3). Числата са тук, за да се
// балансират на едно място; game.test.js/quests.test.js ги пазят.

export const QUEST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Типовете куест. `perPlayer` × играчи (member_progress редове) дава целта,
 * ограничена в [min, max] и закръглена „хубаво“. `reward` = искри на принесъл.
 * TICKETS_SLA не е в ротацията — има смисъл само при панели със SLA; операторът
 * го пуска ръчно от таблото.
 */
export const QUEST_TYPES = Object.freeze({
  MESSAGES:      { key: "MESSAGES",      emoji: "💬", perPlayer: 40,  min: 300, max: 50_000, reward: 100 },
  VOICE_MINUTES: { key: "VOICE_MINUTES", emoji: "🎙️", perPlayer: 15,  min: 120, max: 20_000, reward: 100 },
  POLL_VOTES:    { key: "POLL_VOTES",    emoji: "🗳️", perPlayer: 2,   min: 15,  max: 2_000,  reward: 120 },
  DAILY_CLAIMS:  { key: "DAILY_CLAIMS",  emoji: "📅", perPlayer: 3,   min: 15,  max: 5_000,  reward: 80 },
  VERIFICATIONS: { key: "VERIFICATIONS", emoji: "✅", perPlayer: 1,   min: 10,  max: 5_000,  reward: 120 },
  TICKETS_SLA:   { key: "TICKETS_SLA",   emoji: "🎫", perPlayer: 0.5, min: 10,  max: 2_000,  reward: 150 },
});
export const QUEST_TYPE_KEYS = Object.freeze(Object.keys(QUEST_TYPES));

/** Автоматичната седмична ротация (детерминистична по седмица — тестваема). */
export const ROTATION = Object.freeze(["MESSAGES", "DAILY_CLAIMS", "VOICE_MINUTES", "POLL_VOTES", "VERIFICATIONS"]);

export function weekIndex(now = new Date()) {
  return Math.floor(new Date(now).getTime() / QUEST_DURATION_MS);
}

export function questTypeForWeek(now = new Date()) {
  return ROTATION[weekIndex(now) % ROTATION.length];
}

/** „Хубаво“ закръгляне: до 10 под 1 000, до 50 до 10 000, до 500 нагоре. */
export function niceRound(n) {
  const step = n < 1000 ? 10 : n < 10_000 ? 50 : 500;
  return Math.max(step, Math.round(n / step) * step);
}

/** Целта за тип и брой играчи — clamp в [min, max], закръглена. */
export function targetFor(type, players) {
  const t = QUEST_TYPES[type];
  if (!t) throw new Error(`Unknown quest type: ${type}`);
  const raw = Math.max(0, Number(players) || 0) * t.perPlayer;
  return Math.min(t.max, Math.max(t.min, niceRound(raw)));
}

/** Лента за напредък за embed: ▰▰▰▱▱▱ 42 % */
export function progressBar(progress, target, width = 16) {
  const p = Math.max(0, Math.min(1, target > 0 ? progress / target : 0));
  const filled = Math.round(p * width);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)} ${Math.floor(p * 100)} %`;
}

/**
 * Разпределение на наградата: всеки принесъл (amount > 0) взима rewardSparks;
 * най-големият принос (при равенство — първият по ред) взима ×2 = сандъкът.
 * @returns {{ rewards: {userId:string, sparks:number}[], topUserId: string|null }}
 */
export function splitRewards(contributions, rewardSparks) {
  const list = (contributions || []).filter((c) => (c?.amount || 0) > 0);
  if (!list.length) return { rewards: [], topUserId: null };
  const sorted = [...list].sort((a, b) => b.amount - a.amount);
  const topUserId = sorted[0].userId;
  const base = Math.max(1, Math.floor(rewardSparks));
  return {
    rewards: sorted.map((c) => ({ userId: c.userId, sparks: c.userId === topUserId ? base * 2 : base, amount: c.amount })),
    topUserId,
  };
}

/** Публичните полета на куест за бота/таблото. */
export function publicQuest(q, extra = {}) {
  if (!q) return null;
  const meta = QUEST_TYPES[q.type] || {};
  return {
    id: q.id, serverId: q.serverId, type: q.type, emoji: meta.emoji || "🎯",
    target: q.target, progress: Math.min(q.progress, q.target), rewardSparks: q.rewardSparks, status: q.status,
    startsAt: q.startsAt, endsAt: q.endsAt, channelId: q.channelId, messageId: q.messageId,
    bar: progressBar(q.progress, q.target),
    ...extra,
  };
}
