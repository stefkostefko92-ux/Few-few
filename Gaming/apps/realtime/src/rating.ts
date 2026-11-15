import { prisma, type GameKey } from "@aso/db";
import type { SeatScore } from "@aso/game-core";
import {
  MIN_MMR,
  STARTING_MMR,
  applyXpMultiplier,
  isBettingGame,
  levelFromXp,
  settleStake,
  vipPerksFor,
  type SeatReward,
} from "@aso/shared";

export interface SeatInfo {
  seat: number;
  userId: string | null; // null = bot
  isBot: boolean;
}

/** Таван на разликата в рейтингите при сметката на очаквания резултат
 *  (FIDE Rating Regulations 8.3.1: разлика над 400 т. се третира като 400). */
const MAX_RATING_DIFF = 400;

/**
 * Очакван резултат по логистична крива с таван на разликата ±400 т.
 * ЗАБЕЛЕЖКА: това НЕ е таблицата на FIDE (8.3.4 / нормалното разпределение) —
 * ползваме логистичната формула на Elo, а K е 40 под 30 игри, иначе 20.
 */
export const expectedScore = (rating: number, opponent: number): number => {
  const diff = Math.max(-MAX_RATING_DIFF, Math.min(MAX_RATING_DIFF, opponent - rating));
  return 1 / (1 + 10 ** (diff / 400));
};

/** Закръгляне на .5 далеч от нулата (FIDE 8.3.4): −2.5 → −3, 2.5 → 3 (`Math.round(-2.5)` дава −2). */
export const roundHalfAwayFromZero = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

const kFactor = (games: number): number => (games < 30 ? 40 : 20);

const numericResult = (r: SeatScore["result"]): number =>
  r === "win" ? 1 : r === "draw" ? 0.5 : 0;

/** Base flat reward, scaled only by an engine's explicit win `margin` (1–3×).
 *  It used to read `points`, which is each game's OWN score (Сантасе match
 *  points, Домино's 100+, Риба's books, snooker frame points…): a win in those
 *  games always paid ×3, in chess or belote ×1. Betting games settle a wallet
 *  stake instead (see below). */
export const rewards = (r: SeatScore["result"], margin?: number): { chips: bigint; xp: number } => {
  const mult = r === "win" ? Math.min(Math.max(Math.round(margin ?? 1), 1), 3) : 1;
  return r === "win"
    ? { chips: BigInt(25 * mult), xp: 10 * mult }
    : r === "draw"
      ? { chips: 10n, xp: 5 }
      : { chips: 0n, xp: 3 };
};

async function ratingFor(userId: string, game: GameKey): Promise<{ mmr: number; games: number }> {
  const row = await prisma.ratingPerGame.findUnique({ where: { userId_game: { userId, game } } });
  return { mmr: row?.mmr ?? STARTING_MMR, games: row?.games ?? 0 };
}

/**
 * Persist a finished match: update Elo per game, write MatchPlayer rows, credit
 * chips/xp. Bots have no user row, so only human seats are persisted; a bot
 * contributes a fixed reference rating so humans still gain/lose MMR.
 * Returns mmr deltas keyed by seat (bot seats = 0).
 */
export interface FinalizeResult {
  /** seat -> mmr delta this match */
  deltas: Record<number, number>;
  /** seat -> new mmr after this match (for human seats) */
  newRatings: Record<number, number>;
  /** seat -> chips/xp credited this match (for the game-over card). */
  rewards: Record<number, SeatReward>;
}

export async function finalizeMatch(opts: {
  matchId: string;
  game: GameKey;
  seats: SeatInfo[];
  score: SeatScore[];
  /** Неизиграна партия (оттегляне преди първия ход, FIDE 5.1): мачът се затваря,
   *  но без рейтинг, награди и MatchPlayer редове. */
  unrated?: boolean;
  /** Отделни места без рейтинг/награди/MatchPlayer (оттегляне при ply 0 в маса, която продължава). */
  unratedSeats?: number[];
}): Promise<FinalizeResult> {
  const { matchId, game, seats, score, unrated = false, unratedSeats = [] } = opts;
  const resultBySeat = new Map<number, SeatScore["result"]>(
    score.map((s) => [s.seat, s.result]),
  );

  // "Before" ratings for the Elo computation (fixed reference for bots).
  const before = new Map<number, number>();
  for (const s of seats) {
    const mmr = s.isBot || !s.userId ? STARTING_MMR : (await ratingFor(s.userId, game)).mmr;
    before.set(s.seat, mmr);
  }

  const deltas: Record<number, number> = {};
  const newRatings: Record<number, number> = {};
  const rewardBySeat: Record<number, SeatReward> = {};
  for (const s of seats) deltas[s.seat] = 0;

  const betting = isBettingGame(game);
  const pointsBySeat = new Map<number, number>(score.map((s) => [s.seat, s.points ?? 0]));
  const marginBySeat = new Map<number, number | undefined>(score.map((s) => [s.seat, s.margin]));

  await prisma.$transaction(async (tx) => {
    // Idempotency: atomically claim the match by stamping endedAt only if it
    // was still open. A second finalize (process restart, race, retry) finds
    // count 0 and awards nothing — no double chips/XP/MMR.
    const claimed = await tx.match.updateMany({
      where: { id: matchId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (claimed.count !== 1 || unrated) return;

    for (const seat of seats) {
      if (seat.isBot || !seat.userId || unratedSeats.includes(seat.seat)) continue;
      const result = resultBySeat.get(seat.seat);
      if (!result) continue;
      const userId = seat.userId;

      const opponents = seats.filter((o) => o.seat !== seat.seat);
      const oppAvg =
        opponents.reduce((a, o) => a + (before.get(o.seat) ?? STARTING_MMR), 0) /
        Math.max(opponents.length, 1);
      const myMmr = before.get(seat.seat) ?? STARTING_MMR;

      const current = await ratingFor(userId, game);
      const k = kFactor(current.games);
      // Рейтингът не пада под MIN_MMR: делтата се реже, за да не потъва под пода —
      // подът само ограничава загубата, никога не я превръща в печалба.
      const rawDelta = roundHalfAwayFromZero(k * (numericResult(result) - expectedScore(myMmr, oppAvg)));
      const delta = Math.max(rawDelta, Math.min(0, MIN_MMR - current.mmr));
      deltas[seat.seat] = delta;

      const updated = await tx.ratingPerGame.upsert({
        where: { userId_game: { userId, game } },
        create: {
          userId,
          game,
          mmr: Math.max(MIN_MMR, STARTING_MMR + delta),
          games: 1,
          wins: result === "win" ? 1 : 0,
        },
        update: {
          mmr: { increment: delta },
          games: { increment: 1 },
          wins: { increment: result === "win" ? 1 : 0 },
        },
      });
      // Use the authoritative post-write mmr for the leaderboard, not a
      // pre-read snapshot (correct under concurrent updates).
      newRatings[seat.seat] = updated.mmr;

      // Betting games (Свара) settle a real WALLET stake from the final internal
      // chip count: doubling your stack wins a buy-in, busting loses it. Losses
      // are clamped to the player's available wallet so it can never go negative.
      let chipsDelta: bigint;
      let xp: number;
      // VIP предимствата се четат в транзакцията; изтекъл абонамент = без множител.
      const profile = await tx.user.findUnique({
        where: { id: userId },
        select: { chips: true, vipTier: true, vipUntil: true },
      });
      const perks = vipPerksFor(profile?.vipTier, profile?.vipUntil);
      if (betting) {
        let walletDelta = settleStake(game, pointsBySeat.get(seat.seat) ?? 0);
        if (walletDelta < 0) {
          const wallet = Number(profile?.chips ?? 0n);
          walletDelta = Math.max(walletDelta, -wallet);
        }
        chipsDelta = BigInt(walletDelta);
        xp = result === "win" ? 12 : 6; // wagering a table earns more base XP
      } else {
        const reward = rewards(result, marginBySeat.get(seat.seat));
        chipsDelta = reward.chips;
        xp = reward.xp;
      }
      xp = applyXpMultiplier(xp, perks);
      rewardBySeat[seat.seat] = { chips: Number(chipsDelta), xp };

      await tx.matchPlayer.create({
        data: { matchId, userId, seat: seat.seat, result, mmrDelta: delta, chipsDelta },
      });
      // Атомарен инкремент (заключва реда до края на транзакцията), после
      // нивото от реалния нов xp — колоната `level` вече не остава „1“.
      const after = await tx.user.update({
        where: { id: userId },
        data: { chips: { increment: chipsDelta }, xp: { increment: xp } },
        select: { xp: true, level: true },
      });
      const level = levelFromXp(after.xp).level;
      if (level !== after.level) {
        await tx.user.update({ where: { id: userId }, data: { level } });
      }
    }
  });

  return { deltas, newRatings, rewards: rewardBySeat };
}
