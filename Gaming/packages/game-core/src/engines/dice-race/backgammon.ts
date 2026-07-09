import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Backgammon / Табла (dice-race pattern, §7.2). Open information (board + dice
 * are public), so `redact` is a no-op; all randomness is the dice, drawn from
 * the seeded RNG (opening roll in init, then ROLL) → provably fair via
 * commit-reveal. The game opens with the standard opening roll: one die per
 * player, the higher starts and plays exactly those two dice.
 *
 * Board: 24 points indexed 0..23. `points[i]` is a signed checker count —
 * positive = seat 0 ("white"), negative = seat 1 ("black").
 *   - White moves toward index 0, home = indices 0..5, bears off past 0.
 *   - Black moves toward index 23, home = indices 18..23, bears off past 23.
 *
 * Max-dice obligation enforced: a player must play the greatest number of dice
 * possible, and when only one of two dice can be played, must play the larger
 * (movesFor + maxDicePlayable lookahead).
 */

export interface BackgammonState {
  points: number[]; // length 24, signed
  bar: [number, number]; // checkers on the bar [white, black]
  off: [number, number]; // borne-off checkers [white, black]
  turn: Seat;
  phase: "ROLL" | "MOVE";
  dice: number[]; // dice rolled this turn (2, or 4 on doubles)
  remaining: number[]; // dice values not yet consumed
  /** Opening roll [white die, black die] — present only during the first turn. */
  openingRoll?: [number, number];
}

export type BackgammonAction =
  | { type: "ROLL" }
  | { type: "MOVE"; from: number | "BAR"; die: number }
  | { type: "PASS" };

export type BackgammonEvent =
  | { type: "ROLL"; seat: Seat; dice: number[] }
  | { type: "MOVE"; seat: Seat; from: number | "BAR"; to: number | "OFF"; die: number }
  | { type: "HIT"; seat: Seat; point: number }
  | { type: "PASS"; seat: Seat }
  | { type: "BEAR_OFF"; seat: Seat; from: number }
  | { type: "WIN"; seat: Seat; points: number };

const WHITE = 0;
const BLACK = 1;
const dir = (seat: Seat): 1 | -1 => (seat === WHITE ? -1 : 1); // index delta toward off

function startingPoints(): number[] {
  const p = new Array<number>(24).fill(0);
  p[23] = 2;
  p[12] = 5;
  p[7] = 3;
  p[5] = 5;
  p[0] = -2;
  p[11] = -5;
  p[16] = -3;
  p[18] = -5;
  return p;
}

const at = (s: BackgammonState, i: number): number => s.points[i] ?? 0;
const ownCount = (s: BackgammonState, i: number, seat: Seat): number => {
  const v = at(s, i);
  return seat === WHITE ? Math.max(v, 0) : Math.max(-v, 0);
};
const isBlockedFor = (s: BackgammonState, i: number, seat: Seat): boolean =>
  seat === WHITE ? at(s, i) <= -2 : at(s, i) >= 2;

const barEntry = (seat: Seat, die: number): number => (seat === WHITE ? 24 - die : die - 1);

function destOf(seat: Seat, from: number, die: number): number | "OFF" {
  const d = from + dir(seat) * die;
  if (seat === WHITE) return d < 0 ? "OFF" : d;
  return d > 23 ? "OFF" : d;
}

function allHome(s: BackgammonState, seat: 0 | 1): boolean {
  if (s.bar[seat] > 0) return false;
  if (seat === WHITE) {
    for (let i = 6; i < 24; i++) if (ownCount(s, i, WHITE) > 0) return false;
  } else {
    for (let i = 0; i < 18; i++) if (ownCount(s, i, BLACK) > 0) return false;
  }
  return true;
}

const pipToOff = (seat: Seat, i: number): number => (seat === WHITE ? i + 1 : 24 - i);

function canBearOff(s: BackgammonState, seat: 0 | 1, from: number, die: number): boolean {
  if (!allHome(s, seat)) return false;
  const need = pipToOff(seat, from);
  if (die === need) return true;
  if (die < need) return false;
  if (seat === WHITE) {
    for (let i = from + 1; i <= 5; i++) if (ownCount(s, i, WHITE) > 0) return false;
  } else {
    for (let i = 18; i < from; i++) if (ownCount(s, i, BLACK) > 0) return false;
  }
  return true;
}

/** Raw pseudo-legal moves for the dice still in `remaining` (no max-dice rule). */
function rawMoves(s: BackgammonState): Array<{ from: number | "BAR"; die: number }> {
  const seat = s.turn as 0 | 1;
  const dice = [...new Set(s.remaining)];
  const out: Array<{ from: number | "BAR"; die: number }> = [];

  for (const die of dice) {
    if (s.bar[seat] > 0) {
      const entry = barEntry(seat, die);
      if (!isBlockedFor(s, entry, seat)) out.push({ from: "BAR", die });
      continue;
    }
    for (let i = 0; i < 24; i++) {
      if (ownCount(s, i, seat) === 0) continue;
      const dest = destOf(seat, i, die);
      if (dest === "OFF") {
        if (canBearOff(s, seat, i, die)) out.push({ from: i, die });
      } else if (!isBlockedFor(s, dest, seat)) {
        out.push({ from: i, die });
      }
    }
  }
  return out;
}

/** Apply one move to a shallow board copy for max-dice lookahead (own pieces). */
function simulate(
  s: BackgammonState,
  mv: { from: number | "BAR"; die: number },
): BackgammonState {
  const next = clone(s);
  const seat = s.turn as 0 | 1;
  if (mv.from === "BAR") {
    next.bar[seat] -= 1;
    const entry = barEntry(seat, mv.die);
    next.points[entry] = (next.points[entry] ?? 0) + (seat === WHITE ? 1 : -1);
  } else {
    next.points[mv.from] = (next.points[mv.from] ?? 0) + (seat === WHITE ? -1 : 1);
    const dest = destOf(seat, mv.from, mv.die);
    if (dest === "OFF") next.off[seat] += 1;
    else next.points[dest] = (next.points[dest] ?? 0) + (seat === WHITE ? 1 : -1);
  }
  const di = next.remaining.indexOf(mv.die);
  if (di >= 0) next.remaining.splice(di, 1);
  return next;
}

/** Maximum number of dice playable from this position (DFS over sequences). */
function maxDicePlayable(s: BackgammonState): number {
  const moves = rawMoves(s);
  if (moves.length === 0) return 0;
  let best = 0;
  for (const mv of moves) {
    const depth = 1 + maxDicePlayable(simulate(s, mv));
    if (depth > best) best = depth;
    if (best === s.remaining.length) break; // can't do better than all dice
  }
  return best;
}

/**
 * Legal moves enforcing the max-dice obligation: a player must play the greatest
 * number of dice possible. Only moves that preserve a path to that maximum are
 * offered — which also enforces "play the larger die when only one is possible".
 */
function movesFor(s: BackgammonState): Array<{ from: number | "BAR"; die: number }> {
  const moves = rawMoves(s);
  if (moves.length <= 1) return moves;
  const maxN = maxDicePlayable(s);
  if (maxN <= 1) {
    // Only one die can be played overall — must play the largest such die.
    const playableDice = [...new Set(moves.map((m) => m.die))];
    const largest = Math.max(...playableDice);
    return moves.filter((m) => m.die === largest);
  }
  // Keep only moves from which the remaining maximum is still reachable.
  return moves.filter((mv) => 1 + maxDicePlayable(simulate(s, mv)) === maxN);
}

function clone(s: BackgammonState): BackgammonState {
  const next: BackgammonState = {
    points: [...s.points],
    bar: [s.bar[0], s.bar[1]],
    off: [s.off[0], s.off[1]],
    turn: s.turn,
    phase: s.phase,
    dice: [...s.dice],
    remaining: [...s.remaining],
  };
  if (s.openingRoll) next.openingRoll = [s.openingRoll[0], s.openingRoll[1]];
  return next;
}

function removeFromPoint(s: BackgammonState, i: number, seat: Seat): void {
  s.points[i] = at(s, i) + (seat === WHITE ? -1 : 1);
}

function placeAt(s: BackgammonState, dest: number, seat: Seat): boolean {
  const cur = at(s, dest);
  const opponentBlot = seat === WHITE ? cur === -1 : cur === 1;
  if (opponentBlot) {
    s.bar[seat === WHITE ? BLACK : WHITE] += 1;
    s.points[dest] = 0;
  }
  s.points[dest] = at(s, dest) + (seat === WHITE ? 1 : -1);
  return opponentBlot;
}

function endTurn(s: BackgammonState): void {
  s.turn = s.turn === WHITE ? BLACK : WHITE;
  s.phase = "ROLL";
  s.dice = [];
  s.remaining = [];
  delete s.openingRoll; // the opening turn is over
}

/** Match points for the winner: 1, gammon = 2, backgammon = 3. */
function winPoints(s: BackgammonState, winner: 0 | 1): number {
  const loser = winner === WHITE ? BLACK : WHITE;
  if (s.off[loser] > 0) return 1;
  const inWinnerHome =
    winner === WHITE
      ? s.points.slice(0, 6).some((v) => v < 0)
      : s.points.slice(18, 24).some((v) => v > 0);
  return s.bar[loser] > 0 || inWinnerHome ? 3 : 2;
}

export const backgammonEngine: GameEngine<BackgammonState, BackgammonAction, BackgammonEvent> = {
  init(_opts: InitOpts, rng: SeededRng): BackgammonState {
    // Opening roll: each player throws one die, the higher roller starts and
    // plays exactly those two dice (re-rolled on a tie, so never doubles).
    let d1 = rng.die();
    let d2 = rng.die();
    while (d1 === d2) {
      d1 = rng.die();
      d2 = rng.die();
    }
    return {
      points: startingPoints(),
      bar: [0, 0],
      off: [0, 0],
      turn: d1 > d2 ? WHITE : BLACK,
      phase: "MOVE",
      dice: [d1, d2],
      remaining: [d1, d2],
      openingRoll: [d1, d2],
    };
  },

  legalActions(state, seat) {
    if (backgammonEngine.isTerminal(state)) return [];
    if (seat !== state.turn) return [];
    if (state.phase === "ROLL") return [{ type: "ROLL" }];
    const moves = movesFor(state);
    if (moves.length === 0) return [{ type: "PASS" }];
    return moves.map((m) => ({ type: "MOVE", from: m.from, die: m.die }));
  },

  reduce(state, action, rng: SeededRng) {
    const seat = state.turn as 0 | 1;

    if (action.type === "ROLL") {
      if (state.phase !== "ROLL") throw new IllegalActionError("Not in ROLL phase");
      const d1 = rng.die();
      const d2 = rng.die();
      const next = clone(state);
      next.dice = [d1, d2];
      next.remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      next.phase = "MOVE";
      const events: BackgammonEvent[] = [{ type: "ROLL", seat, dice: [d1, d2] }];
      return { state: next, events };
    }

    if (action.type === "PASS") {
      if (state.phase !== "MOVE" || movesFor(state).length > 0) {
        throw new IllegalActionError("Cannot pass while moves are available");
      }
      const next = clone(state);
      endTurn(next);
      return { state: next, events: [{ type: "PASS", seat }] };
    }

    if (state.phase !== "MOVE") throw new IllegalActionError("Not in MOVE phase");
    const legal = movesFor(state).some((m) => m.from === action.from && m.die === action.die);
    if (!legal) throw new IllegalActionError(`Illegal move from ${action.from} die ${action.die}`);

    const next = clone(state);
    const events: BackgammonEvent[] = [];
    const die = action.die;

    let dest: number | "OFF";
    if (action.from === "BAR") {
      next.bar[seat] -= 1;
      dest = barEntry(seat, die);
    } else {
      removeFromPoint(next, action.from, seat);
      dest = destOf(seat, action.from, die);
    }

    if (dest === "OFF") {
      next.off[seat] += 1;
      events.push({ type: "BEAR_OFF", seat, from: action.from as number });
    } else {
      const hit = placeAt(next, dest, seat);
      if (hit) events.push({ type: "HIT", seat, point: dest });
    }
    events.push({ type: "MOVE", seat, from: action.from, to: dest, die });

    const idx = next.remaining.indexOf(die);
    if (idx >= 0) next.remaining.splice(idx, 1);

    if (next.off[seat] === 15) {
      events.push({ type: "WIN", seat, points: winPoints(next, seat) });
    } else if (next.remaining.length === 0 || movesFor(next).length === 0) {
      endTurn(next);
    }

    return { state: next, events };
  },

  isTerminal(state) {
    return state.off[0] === 15 || state.off[1] === 15;
  },

  score(state): SeatScore[] {
    const winner = state.off[0] === 15 ? WHITE : BLACK;
    const loser = winner === WHITE ? BLACK : WHITE;
    return [
      { seat: winner, result: "win", points: winPoints(state, winner) },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  redact(state) {
    return state;
  },
};
