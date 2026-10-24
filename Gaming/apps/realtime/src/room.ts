import type { Server } from "socket.io";
import { getEngine, SeededRng, type AnyEngine, type SeatScore } from "@aso/game-core";
import {
  GAME_ENGINE,
  isBettingGame,
  SOCKET_EVENTS,
  TIMEOUT_STRIKES_FOR_TAKEOVER,
  turnSecondsFor,
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
import { actionShapeOk } from "./actionGuard.js";

const DISCONNECT_GRACE_MS = env.DISCONNECT_GRACE_SECONDS * 1000;
const DISCONNECTED_TURN_MS = 3000; // snappy bot takeover for a dropped seat
/** Pause before the server itself applies an engine's `autoAdvance` action
 *  (e.g. Свара's open-cards SHOWDOWN) — long enough to read the cards. */
export const AUTO_ADVANCE_MS = 4000;

/** Per-turn clock for a game: ops override (env) → per-game default. */
const turnMsFor = (game: GameKey): number => (env.TURN_SECONDS ?? turnSecondsFor(game)) * 1000;

export interface RoomSeat {
  seat: number;
  userId: string | null;
  isBot: boolean;
  displayName: string;
  bot?: RandomBot;
}

/** Seat metadata in an admin live-tables snapshot (no hidden game state). */
export interface RoomSnapshotSeat {
  seat: number;
  displayName: string;
  isBot: boolean;
  connected: boolean;
  substituted: boolean;
}

/** One live match as seen by the admin live-tables view (§14). */
export interface RoomSnapshot {
  matchId: string;
  game: GameKey;
  ply: number;
  ageMs: number;
  turn: number | null;
  seats: RoomSnapshotSeat[];
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
  /** Wall-clock start (for the admin live-tables age column). */
  readonly createdAt = Date.now();
  /** Applied-move counter (each successful reduce), surfaced to the admin view. */
  private ply = 0;
  private lastOver: {
    matchId: string;
    score: SeatScore[];
    ratingDeltas: Record<number, number>;
    rewards: Record<number, { chips: number; xp: number }>;
  } | null = null;
  private botLoopRunning = false;

  // Live-play resilience (§8.3): per-turn clock + disconnect tracking.
  private readonly fallbackBot: RandomBot;
  private turnTimer?: NodeJS.Timeout;
  private turnEndsAt = 0;
  /** Timer for an engine's server-driven action (e.g. Бинго's timed draw). */
  private serverTimer?: NodeJS.Timeout;
  private turnMs = 0;
  /** Server-driven pause timer (engine `autoAdvance`, e.g. Свара SHOWDOWN). */
  private autoTimer?: NodeJS.Timeout;
  /** Consecutive turn timeouts per human seat; any own move resets it. */
  private readonly strikes = new Map<number, number>();
  /** A seat the bot covers for THIS turn only (first timeout) — cleared as soon
   *  as the turn moves on, so the player keeps the seat. */
  private turnCover: number | null = null;
  private readonly disconnected = new Set<number>(); // human seats currently offline
  private readonly substituted = new Set<number>(); // human seats a bot is covering
  private readonly graceTimers = new Map<string, NodeJS.Timeout>(); // by userId

  constructor(
    private readonly io: Server,
    readonly matchId: string,
    readonly game: GameKey,
    readonly seats: RoomSeat[],
    seed: string,
    config?: unknown,
  ) {
    this.engine = getEngine(game);
    this.rng = new SeededRng(seed);
    this.state = this.engine.init({ seats: seats.length, config }, this.rng);
    this.fallbackBot = new RandomBot(`${seed}:fallback`);
  }

  private seatOf(userId: string): RoomSeat | undefined {
    return this.seats.find((s) => s.userId === userId);
  }

  /** Non-null while the engine wants a server-driven pause (no seat on clock). */
  private autoAction(): unknown | null {
    if (!this.engine.autoAdvance || this.engine.isTerminal(this.state)) return null;
    try {
      return this.engine.autoAdvance(this.state) ?? null;
    } catch (err) {
      logger.warn({ err, matchId: this.matchId }, "engine.autoAdvance threw; ignoring");
      return null;
    }
  }

  /** The seat whose turn it is (the only one with legal actions), or null. */
  private currentSeat(): RoomSeat | null {
    if (this.engine.isTerminal(this.state)) return null;
    for (const s of this.seats) {
      if (this.engine.legalActions(this.state, s.seat).length > 0) return s;
    }
    return null;
  }

  /** A seat is driven by AI if it's a real bot or a human currently substituted. */
  private isBotDriven(seat: RoomSeat): boolean {
    if (seat.isBot) return true;
    // Engines with a `timeoutAction` (Думи) never let a bot play a human seat:
    // that seat stays on the clock and each expiry applies the timeout move.
    if (this.engine.timeoutAction) return false;
    return this.substituted.has(seat.seat) || this.turnCover === seat.seat;
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
    this.armServerTimer();
    void this.runBots();
  }

  /** Schedule the engine's next server-driven action (no-op for most games). */
  private armServerTimer(): void {
    if (this.serverTimer) clearTimeout(this.serverTimer);
    this.serverTimer = undefined;
    if (this.done || !this.engine.serverAction) return;
    const next = this.engine.serverAction(this.state);
    if (!next) return;
    this.serverTimer = setTimeout(() => this.onServerTick(), Math.max(0, next.delayMs));
  }

  /** Server tick: AI seats act first (their natural "reaction delay"), then the
   *  engine's server action (re-read from the current state) is applied. */
  private onServerTick(): void {
    this.serverTimer = undefined;
    if (this.done) return;
    for (const s of this.seats) {
      if (!this.isBotDriven(s)) continue;
      for (let i = 0; i < 40 && !this.done && !this.engine.isTerminal(this.state); i++) {
        const action = (s.bot ?? this.fallbackBot).pick(this.engine, this.state, s.seat);
        if (action === null) break;
        const ok = this.engine.validate
          ? this.engine.validate(this.state, s.seat, action)
          : this.engine.legalActions(this.state, s.seat).some((l) => stable(l) === stable(action));
        if (!ok) break;
        this.applyReduce(action);
      }
    }
    if (this.done || this.engine.isTerminal(this.state)) return;
    const next = this.engine.serverAction?.(this.state);
    if (next) this.applyReduce(next.action);
    this.armServerTimer();
  }

  private sendStateTo(seat: RoomSeat): void {
    if (!seat.userId) return;
    const redacted = this.engine.redact(this.state, seat.seat);
    const legalActions = this.engine.legalActions(this.state, seat.seat);
    // During a server-driven pause nobody is "on turn" (no clock, no AFK).
    const current = this.autoAction() !== null ? null : this.currentSeat();
    const strikes = this.strikes.get(seat.seat) ?? 0;
    this.io.to(userRoom(seat.userId)).emit(SOCKET_EVENTS.GAME_STATE, {
      matchId: this.matchId,
      state: redacted,
      legalActions,
      turn: current ? current.seat : null,
      terminal: this.engine.isTerminal(this.state),
      turnEndsAt: this.turnEndsAt || undefined,
      turnMs: this.turnEndsAt ? this.turnMs : undefined,
      substituted: this.substituted.size ? [...this.substituted] : undefined,
      timeoutStrikes: strikes > 0 ? strikes : undefined,
    });
  }

  private broadcastState(): void {
    for (const s of this.seats) this.sendStateTo(s);
  }

  resync(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat) return;
    this.sendStateTo(seat);
    // A player who missed the final broadcast (tab in background at match end)
    // must still get the verdict — otherwise they reconnect to a zombie table.
    if (this.done && this.lastOver && seat.userId) {
      this.io.to(userRoom(seat.userId)).emit(SOCKET_EVENTS.GAME_OVER, this.lastOver);
    }
  }

  /** Handle a human action. Rejects anything not in that seat's legal set. */
  handleAction(userId: string, action: unknown): void {
    if (this.done) return;
    const seat = this.seatOf(userId);
    if (!seat) return;
    // Acting on your own seat reclaims it from a bot substitute.
    if (this.substituted.has(seat.seat)) {
      this.substituted.delete(seat.seat);
      this.emitPresence(seat.seat, true);
    }
    if (this.turnCover === seat.seat) this.turnCover = null;
    // Free-form engines (e.g. cue sports) validate continuous actions directly;
    // everyone else matches against the enumerated legal set. The action is
    // untrusted client input: bound its shape first, and never let a throwing
    // validator escape — a synchronous throw here would kill the whole node.
    let legal = false;
    if (actionShapeOk(action)) {
      try {
        legal = this.engine.validate
          ? this.engine.validate(this.state, seat.seat, action)
          : this.engine
              .legalActions(this.state, seat.seat)
              .some((l) => stable(l) === stable(action));
      } catch (err) {
        logger.warn({ err, matchId: this.matchId }, "action validation threw; rejecting");
        legal = false;
      }
    }
    if (!legal) {
      this.io.to(userRoom(userId)).emit(SOCKET_EVENTS.ERROR, {
        code: "illegal_action",
        message: "Illegal or out-of-turn action",
      });
      return;
    }
    // Keep the running deadline: a hidden move (e.g. Кент's SIGNAL) must not
    // visibly reset the clock that the other seats see.
    const prevEndsAt = this.turnEndsAt;
    this.clearTurnTimer();
    // A move the player made themselves clears their timeout streak.
    this.strikes.delete(seat.seat);
    this.applyReduce(action, prevEndsAt);
    void this.runBots();
  }

  // ── Turn clock + presence ──────────────────────────────────────────────────

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = undefined;
    this.turnEndsAt = 0;
    this.turnMs = 0;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = undefined;
  }

  /** Arm a clock for the current human seat (shorter if they've dropped). */
  private armTurnTimer(): void {
    this.clearTurnTimer();
    if (this.done) return;
    // Server-driven pause (Свара SHOWDOWN): no seat is clocked or marked AFK;
    // the host applies the engine's action itself after a short beat.
    if (this.autoAction() !== null) {
      this.turnCover = null;
      this.autoTimer = setTimeout(() => this.onAutoAdvance(), AUTO_ADVANCE_MS);
      return;
    }
    const seat = this.currentSeat();
    // The one-turn bot cover ends the moment the turn moves to another seat.
    if (this.turnCover !== null && seat?.seat !== this.turnCover) this.turnCover = null;
    if (!seat || this.isBotDriven(seat)) return; // bots/substitutes are driven by runBots()
    // A session may set its own per-turn time (e.g. Магнат house rules); else the per-game clock.
    const cfgSec = (this.state as { config?: { turnSeconds?: number } }).config?.turnSeconds;
    const baseMs = typeof cfgSec === "number" && cfgSec > 0 ? cfgSec * 1000 : turnMsFor(this.game);
    // Cue games: the previous shot's animation locks the client UI — extend the
    // clock by its real-time length so the striker keeps their full aiming time.
    const animMs =
      GAME_ENGINE[this.game] === "cue-sport" ? ((this.state as { lastShotMs?: number }).lastShotMs ?? 0) : 0;
    // A dropped seat gets a snappy clock for the bot substitute — except where
    // a timeout COSTS the player (timeoutAction): a short drop must not drain lives.
    const snappy = this.disconnected.has(seat.seat) && !this.engine.timeoutAction;
    const delay = (snappy ? DISCONNECTED_TURN_MS : baseMs) + animMs;
    this.turnMs = delay;
    this.turnEndsAt = Date.now() + delay;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(seat.seat), delay);
  }

  /** The server applies the engine's auto-advance action (no seat blamed). */
  private onAutoAdvance(): void {
    this.autoTimer = undefined;
    if (this.done) return;
    const action = this.autoAction();
    if (action === null) return;
    this.applyReduce(action);
    void this.runBots();
  }

  /**
   * Clock expired. First timeout: the seat KEEPS its player — the engine's
   * `timeoutAction` is applied (Думи: a PASS that costs a life) or a bot plays
   * just this turn. Only TIMEOUT_STRIKES_FOR_TAKEOVER consecutive timeouts hand
   * the seat to a bot substitute until the player reclaims it (acting or the
   * explicit reclaim). A move the player makes resets the streak.
   */
  private onTurnTimeout(seat: number): void {
    if (this.done) return;
    const cur = this.currentSeat();
    if (!cur || cur.seat !== seat) return; // they already moved
    this.turnTimer = undefined;
    const strikes = (this.strikes.get(seat) ?? 0) + 1;
    this.strikes.set(seat, strikes);
    const takeover = strikes >= TIMEOUT_STRIKES_FOR_TAKEOVER;
    if (takeover && !this.substituted.has(seat)) {
      this.substituted.add(seat);
      this.emitPresence(seat, false); // surfaces "под контрол на бот" to the table
    }
    const forced = this.timeoutActionFor(seat);
    this.clearTurnTimer();
    if (forced !== null || this.engine.timeoutAction) {
      // No legal timeout move this time (defensive): play one safe move so the
      // seat — which bots never drive in such engines — cannot stall the table.
      const move = forced ?? this.botMove(cur);
      if (move !== null) this.applyReduce(move);
      else this.armTurnTimer();
      void this.runBots();
      return;
    }
    // First timeout: a bot plays out just this turn; the seat stays the player's.
    this.turnCover = takeover ? null : seat;
    this.broadcastState(); // carries the strike warning + clears the clock
    void this.runBots();
  }

  /** The engine's own timeout move for `seat`, validated as legal, or null. */
  private timeoutActionFor(seat: number): unknown | null {
    if (!this.engine.timeoutAction) return null;
    try {
      const a = this.engine.timeoutAction(this.state, seat);
      if (a === null || a === undefined) return null;
      const ok = this.engine.validate
        ? this.engine.validate(this.state, seat, a)
        : this.engine.legalActions(this.state, seat).some((l) => stable(l) === stable(a));
      return ok ? a : null;
    } catch (err) {
      logger.warn({ err, matchId: this.matchId }, "engine.timeoutAction threw; falling back to bot");
      return null;
    }
  }

  /** A player takes their seat back from the bot substitute. */
  reclaim(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat || seat.isBot || this.done) return;
    if (!this.substituted.has(seat.seat)) return;
    this.substituted.delete(seat.seat);
    this.strikes.delete(seat.seat);
    this.emitPresence(seat.seat, true);
    if (this.currentSeat()?.seat === seat.seat) this.armTurnTimer();
    this.broadcastState();
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
      this.substituted.delete(seat.seat); // player is back; stop the bot covering
      this.strikes.delete(seat.seat);
      const g = this.graceTimers.get(userId);
      if (g) {
        clearTimeout(g);
        this.graceTimers.delete(userId);
      }
      this.emitPresence(seat.seat, true);
      // If it's their turn again, give the returning player a fresh full turn.
      if (this.currentSeat()?.seat === seat.seat) this.armTurnTimer();
      this.broadcastState(); // catch everyone up (bot-control flag cleared)
      return;
    }

    if (this.disconnected.has(seat.seat)) return;
    this.disconnected.add(seat.seat);
    // A dropped seat is covered by a bot substitute immediately, so the table
    // never stalls; the player reclaims it on reconnect.
    this.substituted.add(seat.seat);
    this.emitPresence(seat.seat, false);
    // Forfeit only makes sense head-to-head; larger tables keep going with the
    // bot covering the dropped seat.
    if (this.seats.length === 2) {
      this.graceTimers.set(
        userId,
        setTimeout(() => this.onGrace(seat.seat), DISCONNECT_GRACE_MS),
      );
    }
    // If it's their turn, let the substitute pick up right away (never during a
    // server-driven pause — that timer must keep running).
    if (this.autoAction() === null && !this.engine.timeoutAction && this.currentSeat()?.seat === seat.seat) {
      this.clearTurnTimer();
      void this.runBots();
    }
  }

  /**
   * A forfeit / resign / shutdown ends the match with an OVERRIDE result that
   * carries no `points`. For betting tables (Свара) the wallet settles from
   * points, and `points ?? 0` read as "busted" → every seat, the winner too,
   * lost the full buy-in (a deploy restart alone charged everyone 200). Attach
   * each seat's live stack from the engine so the table settles on its real
   * state. Non-betting games keep their result-only rewards untouched.
   */
  private withLivePoints(score: SeatScore[]): SeatScore[] {
    if (!isBettingGame(this.game)) return score;
    let live: SeatScore[] = [];
    try {
      live = this.engine.score(this.state);
    } catch (err) {
      logger.warn({ err, matchId: this.matchId }, "live score unavailable for override settlement");
    }
    const points = new Map(live.map((s) => [s.seat, s.points]));
    return score.map((s) => {
      const p = points.get(s.seat);
      return p === undefined ? s : { ...s, points: p };
    });
  }

  private onGrace(seat: number): void {
    if (this.done || !this.disconnected.has(seat)) return;
    logger.info({ matchId: this.matchId, seat }, "seat abandoned — forfeiting");
    const score: SeatScore[] = this.seats.map((s) => ({
      seat: s.seat,
      result: s.seat === seat ? "loss" : "win",
    }));
    void this.finish(this.withLivePoints(score));
  }

  /** Explicit abandon (the player queued for a new match while seated here):
   *  the seat loses immediately so the table doesn't drag on with auto-play. */
  resign(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat || seat.isBot || this.done) return;
    logger.info({ matchId: this.matchId, seat: seat.seat }, "seat resigned (re-queued elsewhere)");
    const score: SeatScore[] = this.seats.map((s) => ({
      seat: s.seat,
      result: s.seat === seat.seat ? "loss" : "win",
    }));
    void this.finish(this.withLivePoints(score));
  }

  /**
   * Apply one action and fan out the result. Returns true for a HIDDEN move:
   * every event was redacted away for at least one seat and the same seat is
   * still on turn (e.g. Кент's secret SIGNAL). Such a move must be invisible to
   * those seats — no empty GAME_EVENTS packet, no GAME_STATE re-send, no reset
   * turn deadline — or the side channel itself would leak the secret.
   */
  private applyReduce(action: unknown, prevEndsAt = 0): boolean {
    const prevState = this.state;
    const prevSeat = this.currentSeat()?.seat ?? null;
    let result: { state: unknown; events: unknown };
    try {
      result = this.engine.reduce(this.state, action, this.rng);
    } catch (err) {
      // An illegal/stale action must never crash the node (it would kill every
      // live match here). Log and ignore — the authoritative state is unchanged.
      logger.warn({ err, matchId: this.matchId }, "engine.reduce threw; ignoring action");
      if (prevEndsAt) this.rearmUntil(prevEndsAt);
      return false;
    }
    const { state, events } = result;
    this.state = state;
    this.ply++;
    const all = events as unknown[];
    // Seats for which the engine filtered out EVERY event of this move.
    const blind = new Set<number>();
    for (const s of this.seats) {
      // Per-seat event redaction (e.g. Кент's secret SIGNAL reaches only the
      // partner). Engines without the hook broadcast events verbatim.
      const forSeat = this.engine.redactEvent
        ? all.map((ev) => this.engine.redactEvent!(ev as never, s.seat)).filter((ev) => ev !== null)
        : all;
      if (all.length > 0 && forSeat.length === 0) blind.add(s.seat);
      // Never send an empty packet: its mere arrival would be a signal.
      if (!s.userId || forSeat.length === 0) continue;
      this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.GAME_EVENTS, {
        matchId: this.matchId,
        events: forSeat,
      });
    }
    if (this.engine.isTerminal(this.state)) {
      this.clearTurnTimer();
      this.broadcastState();
      void this.finish();
      return false;
    }
    const hidden = blind.size > 0 && (this.currentSeat()?.seat ?? null) === prevSeat;
    if (!hidden) {
      // Arm before broadcasting so the state carries the fresh turn deadline.
      this.armTurnTimer();
      this.broadcastState();
      return false;
    }
    // Hidden move: the same seat keeps its ORIGINAL deadline, and seats that saw
    // nothing get no GAME_STATE either — unless their redacted view really
    // changed (then correctness wins; the engine's tests guard against that).
    if (prevEndsAt) this.rearmUntil(prevEndsAt);
    for (const s of this.seats) {
      if (!blind.has(s.seat)) {
        this.sendStateTo(s);
        continue;
      }
      const before = stable(this.engine.redact(prevState, s.seat));
      const after = stable(this.engine.redact(this.state, s.seat));
      if (before !== after) this.sendStateTo(s);
    }
    return true;
  }

  /** Re-arm the current seat's clock to an EXISTING absolute deadline. */
  private rearmUntil(endsAt: number): void {
    this.clearTurnTimer();
    if (this.done) return;
    if (this.autoAction() !== null) return this.armTurnTimer();
    const seat = this.currentSeat();
    if (!seat || this.isBotDriven(seat)) return;
    this.turnMs = Math.max(this.turnMs, endsAt - Date.now());
    this.turnEndsAt = endsAt;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(seat.seat), Math.max(0, endsAt - Date.now()));
  }

  /** Drive consecutive bot turns until a human must act or the game ends.
   *  Guarded so only one loop runs at a time (re-entrancy from action/timeout
   *  call sites would otherwise apply a move computed against stale state). */
  private async runBots(): Promise<void> {
    if (this.botLoopRunning) return;
    this.botLoopRunning = true;
    // After a hidden move the same bot acts again with NO extra pause — a longer
    // gap before its visible move would itself reveal the secret (timing channel).
    let skipDelay = false;
    try {
      while (!this.done && !this.engine.isTerminal(this.state)) {
        // A server-driven pause belongs to the host's auto-advance timer.
        if (this.autoAction() !== null) break;
        const seat = this.currentSeat();
        if (!seat || !this.isBotDriven(seat)) break;
        // Cue sports: a 2–3s "aiming" pause before the AI shoots so it feels
        // human — but never shorter than the PREVIOUS shot's animation, which
        // clients replay in real time (the cue engine stores its length as
        // `lastShotMs`; fall back conservatively when absent mid-match).
        // Other games get a short beat to let the move animate.
        const isCue = GAME_ENGINE[this.game] === "cue-sport";
        const cueState = this.state as { lastShotMs?: number; shotNo?: number };
        const animMs = isCue ? cueState.lastShotMs ?? ((cueState.shotNo ?? 0) > 0 ? 3500 : 0) : 0;
        const botDelay = isCue ? Math.max(2000 + Math.floor(Math.random() * 1000), animMs + 800) : 350;
        if (!skipDelay) await new Promise((r) => setTimeout(r, botDelay));
        skipDelay = false;
        if (this.done || this.engine.isTerminal(this.state)) break;
        // Recompute against the CURRENT state after the await (it may have moved
        // on, e.g. the player reclaimed), and only act if still AI-driven.
        if (this.autoAction() !== null) break;
        const now = this.currentSeat();
        if (!now || !this.isBotDriven(now) || now.seat !== seat.seat) continue;
        const before = this.state;
        const move = this.botMove(now);
        if (move === null) break; // no legal action at all — nothing to play
        skipDelay = this.applyReduce(move);
        if (this.state === before) {
          // The engine rejected the bot's move: fall back to the first legal
          // action once; if even that fails, stop rather than spin.
          const first = this.firstLegal(now.seat);
          if (first === null) break;
          skipDelay = this.applyReduce(first);
          if (this.state === before) {
            logger.error({ matchId: this.matchId, seat: now.seat }, "bot fallback rejected; bot loop halted");
            break;
          }
        }
      }
    } finally {
      this.botLoopRunning = false;
    }
  }

  /** First enumerated legal action for `seat` (the safe fallback), or null. */
  private firstLegal(seat: number): unknown | null {
    try {
      return this.engine.legalActions(this.state, seat)[0] ?? null;
    } catch (err) {
      logger.warn({ err, matchId: this.matchId }, "legalActions threw for bot fallback");
      return null;
    }
  }

  /**
   * The move an AI-driven seat makes now. A HUMAN seat under substitution uses
   * the engine's `timeoutAction` when it has one (Думи: no free bot words for a
   * player who walked away). A throwing / empty bot never freezes the table:
   * the error is logged and the first legal action is played instead.
   */
  private botMove(seat: RoomSeat): unknown | null {
    if (!seat.isBot) {
      const forced = this.timeoutActionFor(seat.seat);
      if (forced !== null) return forced;
    }
    try {
      const action = (seat.bot ?? this.fallbackBot).pick(this.engine, this.state, seat.seat);
      if (action !== null && action !== undefined) return action;
      logger.warn({ matchId: this.matchId, seat: seat.seat }, "bot returned no move; playing first legal action");
    } catch (err) {
      logger.error({ err, matchId: this.matchId, seat: seat.seat }, "bot.pick threw; playing first legal action");
    }
    return this.firstLegal(seat.seat);
  }

  private async finish(scoreOverride?: SeatScore[]): Promise<void> {
    if (this.done) return;
    this.done = true;
    this.clearTurnTimer();
    if (this.serverTimer) clearTimeout(this.serverTimer);
    this.serverTimer = undefined;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = undefined;
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
    let rewards: Record<number, { chips: number; xp: number }> = {};
    try {
      const result = await finalizeMatch({
        matchId: this.matchId,
        game: this.game,
        seats: seatInfos,
        score,
      });
      ratingDeltas = result.deltas;
      newRatings = result.newRatings;
      rewards = result.rewards;
    } catch (err) {
      logger.error({ err, matchId: this.matchId }, "failed to finalize match");
    }

    const resultBySeat = new Map(score.map((s) => [s.seat, s.result]));

    this.lastOver = { matchId: this.matchId, score, ratingDeltas, rewards };
    for (const s of this.seats) {
      if (!s.userId) continue;
      this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.GAME_OVER, this.lastOver);
      // Advance quests + leaderboards (S6). Fire-and-forget. matchId lets the
      // API make progression idempotent per (match, user).
      void notifyMatchResult({
        matchId: this.matchId,
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

  /** Read-only snapshot for the admin live-tables view (§14). Never exposes
   *  hidden game state — only seat metadata, move count and age. */
  snapshot(): RoomSnapshot {
    return {
      matchId: this.matchId,
      game: this.game,
      ply: this.ply,
      ageMs: Date.now() - this.createdAt,
      turn: this.currentSeat()?.seat ?? null,
      seats: this.seats.map((s) => ({
        seat: s.seat,
        displayName: s.displayName,
        isBot: s.isBot,
        // Human seats are "connected" unless flagged offline / covered by a bot.
        connected: s.isBot ? false : !this.disconnected.has(s.seat),
        substituted: this.substituted.has(s.seat),
      })),
    };
  }

  /** Cleanly end an in-flight match on server shutdown (rolling deploy): finalize
   *  as a draw so MatchPlayer rows are written and clients get GAME_OVER instead
   *  of a silently dropped table. */
  async abortForShutdown(): Promise<void> {
    if (this.done) return;
    const score: SeatScore[] = this.seats.map((s) => ({ seat: s.seat, result: "draw" }));
    await this.finish(this.withLivePoints(score));
  }
}
