import type { Server } from "socket.io";
import { prisma, type GameKey } from "@aso/db";
import { GAME_ENGINES, generateSeed, type AnyEngine } from "@aso/game-core";
import { STARTING_MMR, seatsFor } from "@aso/shared";
import { GameRoom, type RoomSeat } from "./room.js";
import { RandomBot } from "./bot.js";
import { redis } from "./redis.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

interface QueueDesc {
  game: GameKey;
  mode: string;
}

const queueKey = (q: QueueDesc): string => `mm:${q.game}:${q.mode}`;
const joinedField = (q: QueueDesc, userId: string): string => `${q.game}:${q.mode}:${userId}`;
const JOINED_HASH = "mm:joined";

interface QueuedPlayer {
  userId: string;
  mmr: number;
  waitedMs: number;
}

/** MMR tolerance widens the longer a player waits. */
const mmrWindow = (waitedMs: number): number => 100 + Math.floor(waitedMs / 1000) * 60;

export class Matchmaker {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly activeQueues = new Map<string, QueueDesc>();
  private readonly displayNames = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly io: Server) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getRoom(matchId: string): GameRoom | undefined {
    return this.rooms.get(matchId);
  }

  /** The active (unfinished) room a user is seated in, if any. */
  activeRoomForUser(userId: string): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (!room.isDone && room.seats.some((s) => s.userId === userId)) return room;
    }
    return undefined;
  }

  setDisplayName(userId: string, name: string): void {
    this.displayNames.set(userId, name);
  }

  private engineFor(game: GameKey): AnyEngine | undefined {
    return GAME_ENGINES[game];
  }

  async joinQueue(userId: string, game: GameKey, mode = "ranked"): Promise<boolean> {
    if (!this.engineFor(game)) return false;
    const q: QueueDesc = { game, mode };
    const rating = await prisma.ratingPerGame.findUnique({
      where: { userId_game: { userId, game } },
    });
    const mmr = rating?.mmr ?? STARTING_MMR;
    await redis.zadd(queueKey(q), mmr, userId);
    await redis.hset(JOINED_HASH, joinedField(q, userId), Date.now().toString());
    this.activeQueues.set(queueKey(q), q);
    return true;
  }

  async leaveAllQueues(userId: string): Promise<void> {
    for (const q of this.activeQueues.values()) {
      await redis.zrem(queueKey(q), userId);
      await redis.hdel(JOINED_HASH, joinedField(q, userId));
    }
  }

  private async tick(): Promise<void> {
    for (const [id, room] of this.rooms) if (room.isDone) this.rooms.delete(id);
    for (const q of this.activeQueues.values()) {
      try {
        await this.matchQueue(q);
      } catch (err) {
        logger.error({ err, q }, "matchmaking tick failed");
      }
    }
  }

  private async matchQueue(q: QueueDesc): Promise<void> {
    const required = seatsFor(q.game);
    const raw = await redis.zrange(queueKey(q), 0, -1, "WITHSCORES");
    if (raw.length === 0) return;

    const now = Date.now();
    const players: QueuedPlayer[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const userId = raw[i];
      if (!userId) continue;
      const mmr = Number(raw[i + 1] ?? STARTING_MMR);
      const joinedRaw = await redis.hget(JOINED_HASH, joinedField(q, userId));
      players.push({ userId, mmr, waitedMs: now - Number(joinedRaw || now) });
    }

    // Form full human matches: a contiguous (mmr-sorted) window of `required`
    // players whose spread fits the (wait-widened) tolerance.
    while (players.length >= required) {
      const group = players.slice(0, required);
      const spread = group[group.length - 1]!.mmr - group[0]!.mmr;
      const window = mmrWindow(Math.max(...group.map((p) => p.waitedMs)));
      if (spread <= window) {
        const ids = group.map((p) => p.userId);
        await this.dequeue(q, ids);
        await this.createMatch(q, ids, 0);
        players.splice(0, required);
      } else {
        break;
      }
    }

    // Bot fallback: once the longest-waiting player passes the threshold, seat
    // whoever is still queued and fill the remaining seats with bots.
    const longestWait = players.reduce((m, p) => Math.max(m, p.waitedMs), 0);
    if (players.length > 0 && longestWait >= env.BOT_FALLBACK_SECONDS * 1000) {
      const humans = players.slice(0, required).map((p) => p.userId);
      await this.dequeue(q, humans);
      await this.createMatch(q, humans, required - humans.length);
    }
  }

  private async dequeue(q: QueueDesc, userIds: string[]): Promise<void> {
    for (const id of userIds) {
      await redis.zrem(queueKey(q), id);
      await redis.hdel(JOINED_HASH, joinedField(q, id));
    }
  }

  private nameFor(userId: string): string {
    return this.displayNames.get(userId) ?? "Играч";
  }

  /**
   * Seat invited friends into a private match immediately, filling any
   * remaining seats with bots (so any game works for a 1:1 invite). Returns the
   * matchId. Skips users already in an active match.
   */
  async createPrivateMatch(userIds: string[], game: GameKey): Promise<string | null> {
    if (!this.engineFor(game)) return null;
    const free = userIds.filter((id) => !this.activeRoomForUser(id));
    if (free.length === 0) return null;
    const seats = Math.max(2, seatsFor(game));
    const humans = free.slice(0, seats);
    const q: QueueDesc = { game, mode: "private" };
    await this.dequeue(q, humans); // ensure they're not also queued elsewhere
    await this.createMatch(q, humans, seats - humans.length);
    return this.lastMatchId;
  }

  private lastMatchId: string | null = null;

  /** Create a match: human seats first, then `botFill` bot seats. */
  private async createMatch(q: QueueDesc, userIds: string[], botFill: number): Promise<void> {
    const seed = generateSeed();
    const match = await prisma.match.create({ data: { game: q.game, mode: q.mode, seed } });
    const seats: RoomSeat[] = userIds.map((userId, seat) => ({
      seat,
      userId,
      isBot: false,
      displayName: this.nameFor(userId),
    }));
    for (let b = 0; b < botFill; b++) {
      const seat = userIds.length + b;
      seats.push({
        seat,
        userId: null,
        isBot: true,
        displayName: "АСО Бот",
        bot: new RandomBot(`${seed}:bot:${seat}`),
      });
    }
    const room = new GameRoom(this.io, match.id, q.game, seats, seed);
    this.rooms.set(match.id, room);
    this.lastMatchId = match.id;
    room.start();
    logger.info(
      { matchId: match.id, game: q.game, humans: userIds.length, bots: botFill },
      "match created",
    );
  }
}
