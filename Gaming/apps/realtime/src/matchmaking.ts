import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { prisma, type GameKey } from "@aso/db";
import { GAME_ENGINES, generateSeed, type AnyEngine } from "@aso/game-core";
import { MAGNAT_PRESETS, STARTING_MMR, isGameKey, seatsFor } from "@aso/shared";
import { GameRoom, type RoomSeat } from "./room.js";
import type { Lobby } from "./lobby.js";
import { RandomBot } from "./bot.js";
import { redis } from "./redis.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

interface QueueDesc {
  game: GameKey;
  mode: string;
}

/** Per-session engine config derived from the queue mode (e.g. Магнат presets). */
function configFor(q: QueueDesc): unknown {
  if (q.game === "MAGNAT") return MAGNAT_PRESETS[q.mode] ?? MAGNAT_PRESETS.classic;
  return undefined;
}

const queueKey = (q: QueueDesc): string => `mm:${q.game}:${q.mode}`;
const joinedField = (q: QueueDesc, userId: string): string => `${q.game}:${q.mode}:${userId}`;
const JOINED_HASH = "mm:joined";
// Redis-backed so any node's joins are visible to whichever node is matching.
const ACTIVE_SET = "mm:active"; // set of active queue keys
const LEADER_KEY = "mm:leader"; // single-matcher lease
const LEADER_TTL_MS = 3000;

/** Parse a queue key (`mm:GAME:MODE`) back into a QueueDesc. */
function parseQueueKey(key: string): QueueDesc | null {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "mm") return null;
  const game = parts[1]!;
  if (!isGameKey(game)) return null;
  return { game, mode: parts[2]! };
}

interface QueuedPlayer {
  userId: string;
  mmr: number;
  waitedMs: number;
}

/** MMR tolerance widens the longer a player waits. */
const mmrWindow = (waitedMs: number): number => 100 + Math.floor(waitedMs / 1000) * 60;

/**
 * Matchmaker. Game state (rooms) lives in THIS node's memory; the queues,
 * active-queue set, player names, and the matcher lease live in Redis so the
 * server scales horizontally: every node can seat connections and own some
 * matches, but only the node holding the Redis leader lease forms new matches
 * (so players are never double-matched). Cross-node room operations are
 * forwarded by the server (see index.ts) via the Socket.IO cluster adapter.
 */
export class Matchmaker {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly nodeId = randomUUID();
  private timer?: NodeJS.Timeout;

  constructor(private readonly io: Server) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Finalize every in-flight match this node owns (graceful shutdown). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.rooms.values()].map((r) => r.abortForShutdown()));
  }

  getRoom(matchId: string): GameRoom | undefined {
    return this.rooms.get(matchId);
  }

  /** The active (unfinished) room a user is seated in ON THIS NODE, if any. */
  activeRoomForUser(userId: string): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (!room.isDone && room.seats.some((s) => s.userId === userId)) return room;
    }
    return undefined;
  }

  activeMatchIdForUser(userId: string): string | undefined {
    return this.activeRoomForUser(userId)?.matchId;
  }

  /** Launch a match from an assembled lobby (host pressed start). Returns id. */
  async startFromLobby(lobby: Lobby): Promise<string> {
    const seed = generateSeed();
    const match = await prisma.match.create({
      data: { game: lobby.game, mode: lobby.mode, seed },
    });
    const seats = lobby.toRoomSeats(seed);
    // No member may be double-seated in another live match on this node.
    for (const s of seats) if (s.userId) this.activeRoomForUser(s.userId)?.resign(s.userId);
    const room = new GameRoom(this.io, match.id, lobby.game, seats, seed, lobby.config);
    this.rooms.set(match.id, room);
    room.start();
    logger.info(
      { matchId: match.id, game: lobby.game, lobbyId: lobby.id, seats: seats.length },
      "match created from lobby",
    );
    return match.id;
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
    await redis.sadd(ACTIVE_SET, queueKey(q));
    return true;
  }

  async leaveAllQueues(userId: string): Promise<void> {
    const keys = await redis.smembers(ACTIVE_SET);
    for (const key of keys) {
      const q = parseQueueKey(key);
      if (!q) continue;
      await redis.zrem(queueKey(q), userId);
      await redis.hdel(JOINED_HASH, joinedField(q, userId));
    }
  }

  /** Acquire/refresh the single-matcher lease. Only the holder forms matches. */
  private async isLeader(): Promise<boolean> {
    try {
      const got = await redis.set(LEADER_KEY, this.nodeId, "PX", LEADER_TTL_MS, "NX");
      if (got) return true;
      const cur = await redis.get(LEADER_KEY);
      if (cur === this.nodeId) {
        await redis.set(LEADER_KEY, this.nodeId, "PX", LEADER_TTL_MS);
        return true;
      }
    } catch {
      // If Redis is unreachable, fall back to acting as leader (single-node dev).
      return true;
    }
    return false;
  }

  private async tick(): Promise<void> {
    // Reap finished local rooms on every node.
    for (const [id, room] of this.rooms) if (room.isDone) this.rooms.delete(id);

    // Only the leader forms matches (avoids double-matching across nodes).
    if (!(await this.isLeader())) return;
    const keys = await redis.smembers(ACTIVE_SET);
    for (const key of keys) {
      const q = parseQueueKey(key);
      if (!q) {
        await redis.srem(ACTIVE_SET, key);
        continue;
      }
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
    if (raw.length === 0) {
      await redis.srem(ACTIVE_SET, queueKey(q)); // empty — stop scanning it
      return;
    }

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

  /** Display names from the DB (node-agnostic), keyed by id. */
  private async namesFor(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  /**
   * Seat invited friends into a private match immediately, filling any
   * remaining seats with bots (so any game works for a 1:1 invite). Returns the
   * matchId. Skips users already in an active match on this node.
   */
  async createPrivateMatch(userIds: string[], game: GameKey): Promise<string | null> {
    if (!this.engineFor(game)) return null;
    const free = userIds.filter((id) => !this.activeRoomForUser(id));
    if (free.length === 0) return null;
    const seats = Math.max(2, seatsFor(game));
    const humans = free.slice(0, seats);
    const q: QueueDesc = { game, mode: "private" };
    await this.dequeue(q, humans); // ensure they're not also queued elsewhere
    return this.createMatch(q, humans, seats - humans.length);
  }

  /** Create a match: human seats first, then `botFill` bot seats. Returns id. */
  private async createMatch(q: QueueDesc, userIds: string[], botFill: number): Promise<string> {
    const seed = generateSeed();
    const [match, names] = await Promise.all([
      prisma.match.create({ data: { game: q.game, mode: q.mode, seed } }),
      this.namesFor(userIds),
    ]);
    const seats: RoomSeat[] = userIds.map((userId, seat) => ({
      seat,
      userId,
      isBot: false,
      displayName: names.get(userId) ?? "Играч",
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
    const config = configFor(q);
    const room = new GameRoom(this.io, match.id, q.game, seats, seed, config);
    this.rooms.set(match.id, room);
    room.start();
    logger.info(
      { matchId: match.id, game: q.game, humans: userIds.length, bots: botFill },
      "match created",
    );
    return match.id;
  }
}
