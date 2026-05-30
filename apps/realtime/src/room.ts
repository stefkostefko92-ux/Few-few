import type { Server } from "socket.io";
import { getEngine, SeededRng, type AnyEngine, type SeatScore } from "@aso/game-core";
import {
  SOCKET_EVENTS,
  type GameKey,
  type MatchFoundMsg,
  type MatchPlayerInfo,
} from "@aso/shared";
import { RandomBot } from "./bot.js";
import { finalizeMatch, type SeatInfo } from "./rating.js";
import { notifyMatchResult } from "./progression.js";
import { STARTING_MMR } from "@aso/shared";
import { logger } from "./logger.js";

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
    this.applyReduce(action);
    void this.runBots();
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
      this.broadcastState();
      void this.finish();
    } else {
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

  private async finish(): Promise<void> {
    if (this.done) return;
    this.done = true;
    const score = this.engine.score(this.state) as SeatScore[];
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
