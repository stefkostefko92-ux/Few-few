import type { Server } from "socket.io";
import { prisma, type GameKey } from "@aso/db";
import { GAME_ENGINES, generateSeed, type AnyEngine } from "@aso/game-core";
import { STARTING_MMR } from "@aso/shared";
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
    const raw = await redis.zrange(queueKey(q), 0, -1, "WITHSCORES");
    if (raw.length === 0) return;

    const now = Date.now();
    const players: QueuedPlayer[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const userId = raw[i];
      if (!userId) continue;
      const mmr = Number(raw[i + 1] ?? STARTING_MMR);
      const joinedRaw = await redis.hget(JOINED_HASH, joinedField(q, userId));
      const joined = Number(joinedRaw) || now;
      players.push({ userId, mmr, waitedMs: now - joined });
    }

    // Pair adjacent (sorted by mmr) when inside the combined window.
    let i = 0;
    while (i + 1 < players.length) {
      const a = players[i];
      const b = players[i + 1];
      if (!a || !b) break;
      const window = mmrWindow(Math.max(a.waitedMs, b.waitedMs));
      if (Math.abs(a.mmr - b.mmr) <= window) {
        await this.dequeue(q, [a.userId, b.userId]);
        await this.createMatch(q, [a.userId, b.userId]);
        players.splice(i, 2);
      } else {
        i += 1;
      }
    }

    // Bot fallback for anyone who has waited too long.
    for (const p of players) {
      if (p.waitedMs >= env.BOT_FALLBACK_SECONDS * 1000) {
        await this.dequeue(q, [p.userId]);
        await this.createBotMatch(q, p.userId);
      }
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

  private async createMatch(q: QueueDesc, userIds: string[]): Promise<void> {
    const seed = generateSeed();
    const match = await prisma.match.create({ data: { game: q.game, mode: q.mode, seed } });
    const seats: RoomSeat[] = userIds.map((userId, seat) => ({
      seat,
      userId,
      isBot: false,
      displayName: this.nameFor(userId),
    }));
    const room = new GameRoom(this.io, match.id, q.game, seats, seed);
    this.rooms.set(match.id, room);
    room.start();
    logger.info({ matchId: match.id, game: q.game, players: userIds.length }, "match created");
  }

  private async createBotMatch(q: QueueDesc, userId: string): Promise<void> {
    const seed = generateSeed();
    const match = await prisma.match.create({ data: { game: q.game, mode: q.mode, seed } });
    const seats: RoomSeat[] = [
      { seat: 0, userId, isBot: false, displayName: this.nameFor(userId) },
      {
        seat: 1,
        userId: null,
        isBot: true,
        displayName: "АСО Бот",
        bot: new RandomBot(`${seed}:bot`),
      },
    ];
    const room = new GameRoom(this.io, match.id, q.game, seats, seed);
    this.rooms.set(match.id, room);
    room.start();
    logger.info({ matchId: match.id, game: q.game }, "bot match created");
  }
}
