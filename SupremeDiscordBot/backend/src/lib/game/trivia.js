// backend/src/lib/game/trivia.js
// v50 — Server Season, етап 3: trivia кръгове. Въпрос от нашия банк
// (data/triviaBank.js) или — Premium — от базата знания на сървъра („познаваш ли
// правилата на сървъра“): „Коя статия отговаря на: <откъс>?“ с 4 заглавия.
// KB въпросите се сглобяват ЛОКАЛНО от текста на статиите — нищо не отива към
// AI доставчик, затова тук няма AI_REPLY_TRAINING_ATTESTED гейт (той пази
// съдържанието на Discord от обучение на модели, а тук модел няма).
//
// Първият верен отговор печели (условен updateMany winnerId:null — надпревара);
// един отговор на човек на кръг (уникален индекс); кръгът се затваря от победа
// или от scheduler-а при изтичане.
import { prisma } from "../prisma.js";
import { getServerTier } from "../premium.js";
import { getGameSettings, grantXpOnce, XP_REWARDS, ensureProgress } from "./xp.js";
import { TRIVIA_BANK } from "../../data/triviaBank.js";

export const TRIVIA_TTL_MS = 10 * 60 * 1000;
export const TRIVIA_SPARKS = 30;
export const TRIVIA_KB_MIN_ARTICLES = 4;
export const TRIVIA_RECENT_EXCLUDE = 40; // последните N въпроса не се повтарят
export const SCHEDULE_MS = Object.freeze({ daily: 24 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000 });

function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Въпрос от банка, извън `exclude` (ако всичко е изключено — от целия банк). */
export function pickBankQuestion(exclude = [], rand = Math.random) {
  const ex = new Set(exclude);
  const pool = TRIVIA_BANK.filter((q) => !ex.has(q.id));
  const list = pool.length ? pool : TRIVIA_BANK;
  const q = list[Math.floor(rand() * list.length)];
  return { questionId: q.id, source: "BANK", question: q.q, options: [...q.options], answer: q.answer };
}

/** Откъс от статия за въпроса: първите ~140 знака без markdown/нови редове. */
export function snippet(content, max = 140) {
  const s = String(content || "").replace(/[*_`#>\[\]]/g, "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Въпрос от базата знания: 4 различни заглавия, едно от тях е вярното. */
export function kbQuestion(articles, rand = Math.random) {
  const byTitle = new Map();
  for (const a of articles || []) if (a?.enabled !== false && a?.title && a?.content && !byTitle.has(a.title.trim())) byTitle.set(a.title.trim(), a);
  const list = [...byTitle.values()];
  if (list.length < TRIVIA_KB_MIN_ARTICLES) return null;
  const four = shuffled(list, rand).slice(0, 4);
  const target = four[Math.floor(rand() * 4)];
  const options = four.map((a) => a.title.trim().slice(0, 100));
  return {
    questionId: `kb:${target.id}`, source: "KB",
    question: `Which knowledge-base article answers this? “${snippet(target.content)}”`,
    options, answer: options.indexOf(target.title.trim().slice(0, 100)),
  };
}

export function publicRound(r) {
  if (!r) return null;
  return { id: r.id, serverId: r.serverId, channelId: r.channelId, messageId: r.messageId, source: r.source, question: r.question, options: r.options, expiresAt: r.expiresAt, winnerId: r.winnerId, closedAt: r.closedAt };
}

/**
 * Нов кръг в канал. `source: "KB"` само за Premium с ≥4 статии, иначе банк.
 * @returns {Promise<{ok:true, round:object} | {ok:false, code:string}>}
 */
export async function createRound(serverId, channelId, { source = "BANK", now = new Date(), rand = Math.random } = {}) {
  const settings = await getGameSettings(serverId);
  if (!settings.enabled) return { ok: false, code: "GAME_DISABLED" };
  const open = await prisma.triviaRound.findFirst({ where: { serverId, channelId, closedAt: null, expiresAt: { gt: now } } });
  if (open) return { ok: false, code: "ROUND_OPEN" };
  let q = null;
  if (source === "KB") {
    const tier = await getServerTier(serverId);
    if (tier.isPremium) {
      const articles = (await prisma.kbArticle.findMany({ where: { serverId, enabled: true }, select: { id: true, title: true, content: true, enabled: true }, take: 200 })) || [];
      q = kbQuestion(articles, rand);
    }
  }
  if (!q) {
    const recent = (await prisma.triviaRound.findMany({ where: { serverId }, orderBy: { createdAt: "desc" }, take: TRIVIA_RECENT_EXCLUDE, select: { questionId: true } })) || [];
    q = pickBankQuestion(recent.map((r) => r.questionId), rand);
  }
  const round = await prisma.triviaRound.create({
    data: { serverId, channelId, questionId: q.questionId, source: q.source, question: q.question, options: q.options, answer: q.answer, expiresAt: new Date(now.getTime() + TRIVIA_TTL_MS) },
  });
  return { ok: true, round: publicRound(round) };
}

/**
 * Отговор. Един на човек; първият верен печели искри + XP.
 * @returns {Promise<{ok:true, correct:boolean, winner:boolean, answer:number, sparks?:number} | {ok:false, code:string}>}
 */
export async function answerRound(roundId, userId, option, now = new Date()) {
  const round = await prisma.triviaRound.findUnique({ where: { id: roundId } });
  if (!round) return { ok: false, code: "ROUND_NOT_FOUND" };
  // Изключена игра не плаща (червен екип 25.09.2026: отворен рунд продължаваше
  // да раздава искри и XP след изключването).
  const settings = await getGameSettings(round.serverId);
  if (!settings?.enabled) return { ok: false, code: "GAME_DISABLED" };
  if (round.closedAt || round.expiresAt <= now) return { ok: false, code: "ROUND_CLOSED", answer: round.answer };
  const opt = Number(option);
  if (!Number.isInteger(opt) || opt < 0 || opt >= round.options.length) return { ok: false, code: "INVALID_OPTION" };
  const correct = opt === round.answer;
  try {
    await prisma.triviaAnswer.create({ data: { roundId, userId, option: opt, correct } });
  } catch (err) {
    if (err?.code === "P2002") return { ok: false, code: "ALREADY_ANSWERED" };
    throw err;
  }
  if (!correct) return { ok: true, correct: false, winner: false, answer: round.answer };
  const won = await prisma.triviaRound.updateMany({ where: { id: roundId, winnerId: null, closedAt: null }, data: { winnerId: userId, closedAt: now } });
  if (won.count !== 1) return { ok: true, correct: true, winner: false, answer: round.answer };
  await ensureProgress(prisma, round.serverId, userId);
  await prisma.memberProgress.update({ where: { serverId_userId: { serverId: round.serverId, userId } }, data: { sparks: { increment: TRIVIA_SPARKS } } });
  await grantXpOnce(round.serverId, userId, `trivia:${roundId}`, XP_REWARDS.TRIVIA_WIN).catch(() => null);
  return { ok: true, correct: true, winner: true, answer: round.answer, sparks: TRIVIA_SPARKS, xp: XP_REWARDS.TRIVIA_WIN };
}

async function notify(event, payload) {
  try {
    const { notifyBot } = await import("../../services/botNotifier.js");
    return await notifyBot("GAME_TRIVIA", { event, ...payload });
  } catch { return null; }
}

/** Изтекли отворени кръгове → затваряне + известие до бота (показва отговора). */
export async function closeExpiredRounds(now = new Date()) {
  const due = (await prisma.triviaRound.findMany({ where: { closedAt: null, expiresAt: { lte: now } }, take: 200 })) || [];
  let closed = 0;
  for (const r of due) {
    const done = await prisma.triviaRound.updateMany({ where: { id: r.id, closedAt: null }, data: { closedAt: now } });
    if (done.count !== 1) continue;
    await notify("CLOSE", { serverId: r.serverId, round: { ...publicRound(r), closedAt: now, answer: r.answer } });
    closed++;
  }
  return closed;
}

/**
 * Насрочените кръгове: за всеки сървър с канал + разписание — ако от последния
 * кръг е минал интервалът, нов кръг. Дневното е Premium (Free пада на седмично);
 * KB въпроси само Premium. Известява бота да публикува.
 */
export async function scheduleDue(now = new Date(), rand = Math.random) {
  const servers = (await prisma.gameSettings.findMany({ where: { enabled: true, triviaChannelId: { not: null }, triviaSchedule: { in: ["daily", "weekly"] } }, take: 500 })) || [];
  let posted = 0;
  for (const s of servers) {
    const tier = await getServerTier(s.serverId);
    const schedule = s.triviaSchedule === "daily" && !tier.isPremium ? "weekly" : s.triviaSchedule;
    const last = await prisma.triviaRound.findFirst({ where: { serverId: s.serverId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (last && now.getTime() - new Date(last.createdAt).getTime() < SCHEDULE_MS[schedule]) continue;
    // Premium: редуваме банк и база знания (KB пада на банк, когато статиите са < 4).
    const source = tier.isPremium && rand() < 0.5 ? "KB" : "BANK";
    const out = await createRound(s.serverId, s.triviaChannelId, { source, now, rand });
    if (!out.ok) continue;
    await notify("POST", { serverId: s.serverId, round: out.round });
    posted++;
  }
  return posted;
}
