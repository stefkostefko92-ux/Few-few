import type { SeededRng } from "./rng.js";

/** 0-based seat index at a table. */
export type Seat = number;

export interface InitOpts {
  /** Number of seats / players in this match. */
  seats: number;
}

export type GameResult = "win" | "loss" | "draw";

export interface SeatScore {
  seat: Seat;
  result: GameResult;
  /** Optional magnitude (e.g. backgammon gammon = 2, backgammon = 3). */
  points?: number;
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
  /** Legal actions for `seat` — drives validation + client highlighting. */
  legalActions(state: S, seat: Seat): A[];
  reduce(state: S, action: A, rng: SeededRng): ReduceResult<S, E>;
  isTerminal(state: S): boolean;
  score(state: S): SeatScore[];
  /** Hide other seats' private info before broadcasting to `seat` (§7.2). */
  redact(state: S, seat: Seat): S;
}

/** Thrown by `reduce` when an action is not legal in the given state. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
