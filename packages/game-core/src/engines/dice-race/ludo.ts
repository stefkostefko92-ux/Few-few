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
 * on an opponent sends it back home ("изяждане"). First to bring all 4 tokens
 * home wins.
 *
 * Track model: positions are -1 (home/base), 0..39 (main loop, seat-relative
 * entry offset), 40..43 (home column), 44 = finished. We store ABSOLUTE main
 * positions for collision; per-seat entry is seat*10.
 */

const TOKENS = 4;
const MAIN = 40;
const HOME_COL = 4;
const FINISH = MAIN + HOME_COL; // 44 (progress index meaning "home")

export interface LudoState {
  // progress[seat][token]: -1 base, 0..39 steps on main path (seat-relative),
  // 40..43 home column, 44 finished.
  progress: number[][];
  turn: Seat;
  seats: number;
  die: number | null; // current unconsumed roll
  rolledSix: boolean;
  winner: Seat | null;
  done: boolean;
}

export type LudoAction = { type: "ROLL" } | { type: "MOVE"; token: number } | { type: "PASS" };
export type LudoEvent =
  | { type: "ROLL"; seat: Seat; die: number }
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
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    if (state.die === null) return [{ type: "ROLL" }];
    const moves = movableTokens(state, seat).map((token) => ({ type: "MOVE" as const, token }));
    return moves.length > 0 ? moves : [{ type: "PASS" }];
  },

  reduce(state, action, rng: SeededRng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: LudoState = { ...state, progress: state.progress.map((p) => p.slice()) };
    const events: LudoEvent[] = [];

    if (action.type === "ROLL") {
      if (next.die !== null) throw new IllegalActionError("Already rolled");
      const die = rng.die();
      next.die = die;
      next.rolledSix = die === 6;
      events.push({ type: "ROLL", seat, die });
      if (movableTokens(next, seat).length === 0) {
        // No legal move — turn passes (unless a 6 with all tokens home/finished).
        endTurn(next, seat);
      }
      return { state: next, events };
    }

    if (action.type === "PASS") {
      if (next.die === null || movableTokens(next, seat).length > 0) {
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

    // Rolling a 6 grants another roll; otherwise turn passes.
    if (next.rolledSix) {
      next.die = null;
      next.rolledSix = false;
    } else {
      endTurn(next, seat);
    }
    return { state: next, events };
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

function endTurn(state: LudoState, seat: Seat): void {
  state.die = null;
  state.rolledSix = false;
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
