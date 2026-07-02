import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Не се сърди човече (Ludo) — 2–4p dice race (§4.10). Each player has 4 tokens.
 * Roll a die; a 6 lets a token leave home (and grants another roll). Tokens
 * travel a shared 40-cell main track then a 4-cell private home column. Landing
 * on an opponent sends it back home ("изяждане"). A player whose unfinished
 * tokens are all in the base gets up to three throws to find a 6. A roll with
 * no legal move stays visible (NO_MOVE event + die kept in state) until the
 * player rolls again or passes. First to bring all 4 tokens home wins.
 *
 * Track model: positions are -1 (home/base), 0..39 (main loop, seat-relative
 * entry offset), 40..43 (home column), 44 = finished. We store ABSOLUTE main
 * positions for collision; per-seat entry is seat*10.
 */

const TOKENS = 4;
const MAIN = 40;
const HOME_COL = 4;
const FINISH = MAIN + HOME_COL; // 44 (progress index meaning "home")
/** Throws allowed in one turn while every unfinished token sits in the base. */
const BASE_ATTEMPTS = 3;

export interface LudoState {
  // progress[seat][token]: -1 base, 0..39 steps on main path (seat-relative),
  // 40..43 home column, 44 finished.
  progress: number[][];
  turn: Seat;
  seats: number;
  die: number | null; // current unconsumed roll (kept visible on a no-move roll)
  rolledSix: boolean;
  /** Rolls taken this turn — caps the "three throws for a six" base rule. */
  attempts: number;
  winner: Seat | null;
  done: boolean;
}

export type LudoAction = { type: "ROLL" } | { type: "MOVE"; token: number } | { type: "PASS" };
export type LudoEvent =
  | { type: "ROLL"; seat: Seat; die: number }
  | { type: "NO_MOVE"; seat: Seat; die: number; retry: boolean }
  | { type: "MOVE"; seat: Seat; token: number; to: number }
  | { type: "CAPTURE"; seat: Seat; victim: Seat; token: number }
  | { type: "PASS"; seat: Seat }
  | { type: "WIN"; seat: Seat };

const entryOffset = (seat: Seat): number => seat * 10;
/** Absolute main-loop cell for a seat-relative step (0..39), or null if not on main. */
function absCell(seat: Seat, prog: number): number | null {
  if (prog < 0 || prog >= MAIN) return null;
  return (entryOffset(seat) + prog) % MAIN;
}

export const ludoEngine: GameEngine<LudoState, LudoAction, LudoEvent> = {
  init(opts: InitOpts): LudoState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    return {
      progress: Array.from({ length: seats }, () => new Array<number>(TOKENS).fill(-1)),
      turn: 0,
      seats,
      die: null,
      rolledSix: false,
      attempts: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.die === null) return [{ type: "ROLL" }];
    const moves = movableTokens(state, seat).map((token) => ({ type: "MOVE" as const, token }));
    if (moves.length > 0) return moves;
    // Rolled but stuck: a 6 (or a remaining base attempt) grants another throw,
    // otherwise the turn ends with an explicit PASS — the die stays visible.
    return canRollAgain(state, seat) ? [{ type: "ROLL" }] : [{ type: "PASS" }];
  },

  reduce(state, action, rng: SeededRng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: LudoState = { ...state, progress: state.progress.map((p) => p.slice()) };
    const events: LudoEvent[] = [];

    if (action.type === "ROLL") {
      if (next.die !== null) {
        // Only a stuck roll with a re-throw right (6 / base attempts) may re-roll.
        if (movableTokens(next, seat).length > 0 || !canRollAgain(next, seat)) {
          throw new IllegalActionError("Already rolled");
        }
      }
      const die = rng.die();
      next.die = die;
      next.rolledSix = die === 6;
      next.attempts += 1;
      events.push({ type: "ROLL", seat, die });
      if (movableTokens(next, seat).length === 0) {
        // Keep the die in state so everyone SEES the dead roll; the turn ends
        // via PASS (or continues via ROLL when a re-throw is granted).
        events.push({ type: "NO_MOVE", seat, die, retry: canRollAgain(next, seat) });
      }
      return { state: next, events };
    }

    if (action.type === "PASS") {
      if (next.die === null || movableTokens(next, seat).length > 0 || canRollAgain(next, seat)) {
        throw new IllegalActionError("Cannot pass now");
      }
      events.push({ type: "PASS", seat });
      endTurn(next, seat);
      return { state: next, events };
    }

    // MOVE
    if (next.die === null) throw new IllegalActionError("Roll first");
    const die = next.die;
    if (!movableTokens(next, seat).includes(action.token)) {
      throw new IllegalActionError("Token cannot move");
    }
    const cur = next.progress[seat]![action.token]!;
    const dest = cur === -1 ? 0 : cur + die; // a 6 (validated by movable) brings out to step 0
    next.progress[seat]![action.token] = dest;
    events.push({ type: "MOVE", seat, token: action.token, to: dest });

    // Capture: if we landed on a main cell occupied by a single opponent token.
    const abs = absCell(seat, dest);
    if (abs !== null) {
      for (let s = 0; s < next.seats; s++) {
        if (s === seat) continue;
        for (let tk = 0; tk < TOKENS; tk++) {
          const op = next.progress[s]![tk]!;
          if (absCell(s, op) === abs) {
            next.progress[s]![tk] = -1;
            events.push({ type: "CAPTURE", seat, victim: s, token: tk });
          }
        }
      }
    }

    // Win check.
    if (next.progress[seat]!.every((p) => p >= FINISH)) {
      events.push({ type: "WIN", seat });
      return { state: { ...next, winner: seat, done: true, die: null }, events };
    }

    // Rolling a 6 grants another roll; otherwise turn passes. A consumed move
    // resets the base-attempt budget (e.g. the last runner just finished).
    next.attempts = 0;
    if (next.rolledSix) {
      next.die = null;
      next.rolledSix = false;
    } else {
      endTurn(next, seat);
    }
    return { state: next, events };
  },

  /** Simple priorities: finish > capture > leave base on a 6 > push the leader. */
  bot(state, seat) {
    if (state.done || seat !== state.turn) return null;
    if (state.die === null) return { type: "ROLL" };
    const movable = movableTokens(state, seat);
    if (movable.length === 0) return canRollAgain(state, seat) ? { type: "ROLL" } : { type: "PASS" };

    const die = state.die;
    const destOf = (t: number): number => {
      const cur = state.progress[seat]![t]!;
      return cur === -1 ? 0 : cur + die;
    };
    const captures = (t: number): boolean => {
      const abs = absCell(seat, destOf(t));
      if (abs === null) return false;
      for (let s = 0; s < state.seats; s++) {
        if (s === seat) continue;
        for (let tk = 0; tk < TOKENS; tk++) {
          if (absCell(s, state.progress[s]![tk]!) === abs) return true;
        }
      }
      return false;
    };

    const finish = movable.find((t) => destOf(t) === FINISH);
    if (finish !== undefined) return { type: "MOVE", token: finish };
    const capture = movable.find(captures);
    if (capture !== undefined) return { type: "MOVE", token: capture };
    const fromBase = movable.find((t) => state.progress[seat]![t]! === -1);
    if (fromBase !== undefined) return { type: "MOVE", token: fromBase };
    let lead = movable[0]!;
    for (const t of movable) {
      if (state.progress[seat]![t]! > state.progress[seat]![lead]!) lead = t;
    }
    return { type: "MOVE", token: lead };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? leader(state);
    return state.progress.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: seat === winner ? 1 : 0,
    }));
  },

  redact: (s) => s, // open information
};

/** Tokens that can legally move with the current die. */
function movableTokens(state: LudoState, seat: Seat): number[] {
  const die = state.die;
  if (die === null) return [];
  const out: number[] = [];
  for (let t = 0; t < TOKENS; t++) {
    const cur = state.progress[seat]![t]!;
    if (cur >= FINISH) continue; // already finished
    if (cur === -1) {
      if (die === 6) out.push(t); // leave base only on a 6
      continue;
    }
    if (cur + die <= FINISH) out.push(t); // cannot overshoot the finish
  }
  return out;
}

/** Every unfinished token still in the base (the "three throws" situation). */
function allInBase(state: LudoState, seat: Seat): boolean {
  return state.progress[seat]!.every((p) => p === -1 || p >= FINISH);
}

/** After a dead roll: a 6 always re-throws; an all-in-base player gets up to
 *  BASE_ATTEMPTS throws per turn to find a 6. */
function canRollAgain(state: LudoState, seat: Seat): boolean {
  if (state.rolledSix) return true;
  return allInBase(state, seat) && state.attempts < BASE_ATTEMPTS;
}

function endTurn(state: LudoState, seat: Seat): void {
  state.die = null;
  state.rolledSix = false;
  state.attempts = 0;
  state.turn = (seat + 1) % state.seats;
}

function leader(state: LudoState): Seat {
  let best = 0;
  let bestSum = -Infinity;
  for (let s = 0; s < state.seats; s++) {
    const sum = state.progress[s]!.reduce((a, p) => a + Math.max(p, 0), 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = s;
    }
  }
  return best;
}
