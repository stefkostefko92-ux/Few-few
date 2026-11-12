import type { SeededRng } from "./rng.js";

/** 0-based seat index at a table. */
export type Seat = number;

export interface InitOpts {
  /** Number of seats / players in this match. */
  seats: number;
  /** Optional game-specific session config (e.g. Магнат house rules). Engines
   *  that support it cast/validate this; others ignore it. */
  config?: unknown;
}

export type GameResult = "win" | "loss" | "draw";

export interface SeatScore {
  seat: Seat;
  result: GameResult;
  /** Optional magnitude (e.g. backgammon gammon = 2, backgammon = 3). */
  points?: number;
  /** Optional final place (1 = first) for games that rank every seat. */
  rank?: number;
}

/** Base game event; engines narrow this with a discriminated `type`. */
export interface GameEvent {
  type: string;
  seat?: Seat;
}

export interface ReduceResult<S, E extends GameEvent> {
  state: S;
  events: E[];
}

/**
 * The single contract every game reduces to (§7.2). Implementations are pure
 * and deterministic: no I/O, all randomness via the injected SeededRng. State
 * must be JSON-serializable so it can be snapshotted (Redis) and broadcast.
 */
export interface GameEngine<S, A, E extends GameEvent = GameEvent> {
  init(opts: InitOpts, rng: SeededRng): S;
  /** Legal actions for `seat` — drives validation + client highlighting. For
   *  games with a continuous action space (e.g. a cue shot's angle/power) this
   *  returns a finite set of candidate actions for bots/auto-play, while exact
   *  human input is checked by the optional `validate` hook below. */
  legalActions(state: S, seat: Seat): A[];
  /**
   * Optional free-form validation for parameterized actions that can't be
   * enumerated (the room uses this instead of legalActions equality when
   * present). Returns true iff `action` is legal for `seat` in `state`.
   */
  validate?(state: S, seat: Seat, action: A): boolean;
  reduce(state: S, action: A, rng: SeededRng): ReduceResult<S, E>;
  /**
   * Optional heuristic bot policy. When present, the realtime host prefers it
   * over uniform-random action selection for richer AI play. Must return one of
   * `legalActions(state, seat)` (or null to defer to random).
   */
  bot?(state: S, seat: Seat, rng: SeededRng): A | null;
  /**
   * Optional SERVER-driven action (e.g. Бинго's timed draw): when it returns
   * non-null, the realtime host applies `action` after `delayMs` (re-evaluated
   * after every such action) without any seat's input. Never accepted from a
   * client — `validate`/`legalActions` must reject it. Engines with this hook
   * may let several seats act at once through `validate` (empty
   * `legalActions`); the host then drives AI seats via `bot()` in the pause
   * before each server action.
   */
  serverAction?(state: S): { action: A; delayMs: number } | null;
  isTerminal(state: S): boolean;
  score(state: S): SeatScore[];
  /** Hide other seats' private info before broadcasting to `seat` (§7.2). */
  redact(state: S, seat: Seat): S;
  /**
   * Optionally redact a broadcast EVENT for a specific seat (e.g. Кент's
   * secret SIGNAL must reach only the partner). Return null to drop the event
   * for that seat entirely; omit the hook to broadcast events verbatim.
   */
  redactEvent?(event: E, seat: Seat): E | null;
  /**
   * Optional server-driven pause (e.g. Свара's open-cards SHOWDOWN, where ANY
   * seat may CONTINUE): return the action the host applies by itself after a
   * short pause. While non-null no seat is on the clock — nobody is marked AFK
   * and bots wait for the host instead of acting.
   */
  autoAdvance?(state: S): A | null;
  /**
   * Optional action the host applies when `seat`'s turn clock expires, INSTEAD
   * of letting a bot play the move (e.g. Думи: a timeout is a PASS that costs a
   * life — waiting must never be rewarded with a free bot word). Also used for a
   * human seat under bot substitution. Must be legal for `seat` in `state`.
   */
  timeoutAction?(state: S, seat: Seat): A | null;
}

/** Thrown by `reduce` when an action is not legal in the given state. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
