import type { Server } from "socket.io";
import { getEngine, SeededRng, type AnyEngine, type SeatScore } from "@aso/game-core";
import {
  SOCKET_EVENTS,
  type GameKey,
  type MatchFoundMsg,
  type MatchPlayerInfo,
  type PresenceMsg,
} from "@aso/shared";
import { RandomBot } from "./bot.js";
import { finalizeMatch, type SeatInfo } from "./rating.js";
import { notifyMatchResult } from "./progression.js";
import { STARTING_MMR } from "@aso/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";

const TURN_MS = env.TURN_SECONDS * 1000;
const DISCONNECT_GRACE_MS = env.DISCONNECT_GRACE_SECONDS * 1000;
const DISCONNECTED_TURN_MS = 3000; // snappy bot takeover for a dropped seat

export interface RoomSeat {
  seat: number;
  userId: string | null;
  isBot: boolean;
  displayName: string;
  bot?: RandomBot;
}

const userRoom = (userId: string): string => `u:${userId}`;

/** Stable, key-order-independent serialization for action equality. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/**
 * Single source of authority for one match (§8.3). Holds the engine state in
 * memory, validates every action against `legalActions`, never sends a seat
 * another seat's private info (`redact`), and drives bot turns.
 */
export class GameRoom {
  readonly engine: AnyEngine;
  private readonly rng: SeededRng;
  private state: unknown;
  private done = false;

  // Live-play resilience (§8.3): per-turn clock + disconnect tracking.
  private readonly fallbackBot: RandomBot;
  private turnTimer?: NodeJS.Timeout;
  private turnEndsAt = 0;
  private readonly disconnected = new Set<number>(); // human seats currently offline
  private readonly graceTimers = new Map<string, NodeJS.Timeout>(); // by userId

  constructor(
    private readonly io: Server,
    readonly matchId: string,
    readonly game: GameKey,
    readonly seats: RoomSeat[],
    seed: string,
  ) {
    this.engine = getEngine(game);
    this.rng = new SeededRng(seed);
    this.state = this.engine.init({ seats: seats.length }, this.rng);
    this.fallbackBot = new RandomBot(`${seed}:fallback`);
  }

  private seatOf(userId: string): RoomSeat | undefined {
    return this.seats.find((s) => s.userId === userId);
  }

  /** The seat whose turn it is (the only one with legal actions), or null. */
  private currentSeat(): RoomSeat | null {
    if (this.engine.isTerminal(this.state)) return null;
    for (const s of this.seats) {
      if (this.engine.legalActions(this.state, s.seat).length > 0) return s;
    }
    return null;
  }

  /** Begin: announce the match to each human, push initial state, run any bot opener. */
  start(): void {
    const players: MatchPlayerInfo[] = this.seats.map((s) => ({
      seat: s.seat,
      displayName: s.displayName,
      isBot: s.isBot,
    }));
    for (const s of this.seats) {
      if (!s.userId) continue;
      const msg: MatchFoundMsg = { matchId: this.matchId, game: this.game, seat: s.seat, players };
      this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.MATCH_FOUND, msg);
    }
    this.armTurnTimer();
    this.broadcastState();
    void this.runBots();
  }

  private sendStateTo(seat: RoomSeat): void {
    if (!seat.userId) return;
    const redacted = this.engine.redact(this.state, seat.seat);
    const legalActions = this.engine.legalActions(this.state, seat.seat);
    const current = this.currentSeat();
    this.io.to(userRoom(seat.userId)).emit(SOCKET_EVENTS.GAME_STATE, {
      matchId: this.matchId,
      state: redacted,
      legalActions,
      turn: current ? current.seat : null,
      terminal: this.engine.isTerminal(this.state),
      turnEndsAt: this.turnEndsAt || undefined,
    });
  }

  private broadcastState(): void {
    for (const s of this.seats) this.sendStateTo(s);
  }

  resync(userId: string): void {
    const seat = this.seatOf(userId);
    if (seat) this.sendStateTo(seat);
  }

  /** Handle a human action. Rejects anything not in that seat's legal set. */
  handleAction(userId: string, action: unknown): void {
    if (this.done) return;
    const seat = this.seatOf(userId);
    if (!seat) return;
    const legals = this.engine.legalActions(this.state, seat.seat);
    const target = stable(action);
    if (!legals.some((l) => stable(l) === target)) {
      this.io.to(userRoom(userId)).emit(SOCKET_EVENTS.ERROR, {
        code: "illegal_action",
        message: "Illegal or out-of-turn action",
      });
      return;
    }
    this.clearTurnTimer();
    this.applyReduce(action);
    void this.runBots();
  }

  // ── Turn clock + presence ──────────────────────────────────────────────────

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = undefined;
    this.turnEndsAt = 0;
  }

  /** Arm a clock for the current human seat (shorter if they've dropped). */
  private armTurnTimer(): void {
    this.clearTurnTimer();
    if (this.done) return;
    const seat = this.currentSeat();
    if (!seat || seat.isBot) return; // bots are driven by runBots()
    const delay = this.disconnected.has(seat.seat) ? DISCONNECTED_TURN_MS : TURN_MS;
    this.turnEndsAt = Date.now() + delay;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(seat.seat), delay);
  }

  /** Clock expired: the server plays a legal move for the seat (anti-stall). */
  private onTurnTimeout(seat: number): void {
    if (this.done) return;
    const cur = this.currentSeat();
    if (!cur || cur.seat !== seat) return; // they already moved
    const action = this.fallbackBot.pick(this.engine, this.state, seat);
    if (action === null) {
      this.armTurnTimer();
      return;
    }
    this.applyReduce(action);
    void this.runBots();
  }

  private emitPresence(seat: number, connected: boolean): void {
    const msg: PresenceMsg = { matchId: this.matchId, seat, connected };
    for (const s of this.seats) {
      if (s.userId) this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.PRESENCE, msg);
    }
  }

  /** Update a human seat's connection. Reconnect resyncs; a drop in a 2-seat
   *  match starts a forfeit grace timer, and shortens that seat's turn clock. */
  setConnected(userId: string, connected: boolean): void {
    const seat = this.seatOf(userId);
    if (!seat || seat.isBot || this.done) return;

    if (connected) {
      if (!this.disconnected.has(seat.seat)) return;
      this.disconnected.delete(seat.seat);
      const g = this.graceTimers.get(userId);
      if (g) {
        clearTimeout(g);
        this.graceTimers.delete(userId);
      }
      this.emitPresence(seat.seat, true);
      this.sendStateTo(seat); // catch them up
      return;
    }

    if (this.disconnected.has(seat.seat)) return;
    this.disconnected.add(seat.seat);
    this.emitPresence(seat.seat, false);
    // Forfeit only makes sense head-to-head; larger tables keep going with the
    // bot covering the dropped seat.
    if (this.seats.length === 2) {
      this.graceTimers.set(
        userId,
        setTimeout(() => this.onGrace(seat.seat), DISCONNECT_GRACE_MS),
      );
    }
    // If it's their turn, shorten the clock so the table isn't left waiting.
    if (this.currentSeat()?.seat === seat.seat) this.armTurnTimer();
  }

  private onGrace(seat: number): void {
    if (this.done || !this.disconnected.has(seat)) return;
    logger.info({ matchId: this.matchId, seat }, "seat abandoned — forfeiting");
    const score: SeatScore[] = this.seats.map((s) => ({
      seat: s.seat,
      result: s.seat === seat ? "loss" : "win",
    }));
    void this.finish(score);
  }

  private applyReduce(action: unknown): void {
    const { state, events } = this.engine.reduce(this.state, action, this.rng);
    this.state = state;
    for (const s of this.seats) {
      if (s.userId) {
        this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.GAME_EVENTS, {
          matchId: this.matchId,
          events,
        });
      }
    }
    if (this.engine.isTerminal(this.state)) {
      this.clearTurnTimer();
      this.broadcastState();
      void this.finish();
    } else {
      // Arm before broadcasting so the state carries the fresh turn deadline.
      this.armTurnTimer();
      this.broadcastState();
    }
  }

  /** Drive consecutive bot turns until a human must act or the game ends. */
  private async runBots(): Promise<void> {
    while (!this.done && !this.engine.isTerminal(this.state)) {
      const seat = this.currentSeat();
      if (!seat || !seat.isBot || !seat.bot) break;
      const action = seat.bot.pick(this.engine, this.state, seat.seat);
      if (action === null) break;
      // Small delay so the client can animate the bot's move naturally.
      await new Promise((r) => setTimeout(r, 350));
      if (this.done) break;
      this.applyReduce(action);
    }
  }

  private async finish(scoreOverride?: SeatScore[]): Promise<void> {
    if (this.done) return;
    this.done = true;
    this.clearTurnTimer();
    for (const g of this.graceTimers.values()) clearTimeout(g);
    this.graceTimers.clear();
    const score = scoreOverride ?? (this.engine.score(this.state) as SeatScore[]);
    const seatInfos: SeatInfo[] = this.seats.map((s) => ({
      seat: s.seat,
      userId: s.userId,
      isBot: s.isBot,
    }));

    let ratingDeltas: Record<number, number> = {};
    let newRatings: Record<number, number> = {};
    try {
      const result = await finalizeMatch({
        matchId: this.matchId,
        game: this.game,
        seats: seatInfos,
        score,
      });
      ratingDeltas = result.deltas;
      newRatings = result.newRatings;
    } catch (err) {
      logger.error({ err, matchId: this.matchId }, "failed to finalize match");
    }

    const resultBySeat = new Map(score.map((s) => [s.seat, s.result]));

    for (const s of this.seats) {
      if (!s.userId) continue;
      this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.GAME_OVER, {
        matchId: this.matchId,
        score,
        ratingDeltas,
      });
      // Advance quests + leaderboards (S6). Fire-and-forget.
      void notifyMatchResult({
        userId: s.userId,
        game: this.game,
        won: resultBySeat.get(s.seat) === "win",
        rating: newRatings[s.seat] ?? STARTING_MMR,
        displayName: s.displayName,
      });
    }
  }

  get isDone(): boolean {
    return this.done;
  }
}
