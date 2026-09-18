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
  phase: "ROLL" | "MOVE" | "DOUBLE";
  dice: number[]; // dice rolled this turn (2, or 4 on doubles)
  remaining: number[]; // dice values not yet consumed
  /** Opening roll [white die, black die] — present only during the first turn. */
  openingRoll?: [number, number];
  /** Doubling cube value: 1 → 2 → 4 → 8 → 16 → 32 → 64. */
  cube: number;
  /** Seat that owns the cube (may propose the next double); null = centered. */
  cubeOwner: Seat | null;
  /** Set when a player wins by a dropped double (concession); null otherwise. */
  winner: Seat | null;
}

export type BackgammonAction =
  | { type: "ROLL" }
  | { type: "MOVE"; from: number | "BAR"; die: number }
  | { type: "PASS" }
  | { type: "DOUBLE" }
  | { type: "TAKE" }
  | { type: "DROP" };

export type BackgammonEvent =
  | { type: "ROLL"; seat: Seat; dice: number[] }
  | { type: "MOVE"; seat: Seat; from: number | "BAR"; to: number | "OFF"; die: number }
  | { type: "HIT"; seat: Seat; point: number }
  | { type: "PASS"; seat: Seat }
  | { type: "BEAR_OFF"; seat: Seat; from: number }
  /** A player offers to double the stake; `value` is the proposed new cube. */
  | { type: "DOUBLE"; seat: Seat; value: number }
  /** The double is accepted; `value` is the new (doubled) cube. */
  | { type: "TAKE"; seat: Seat; value: number }
  /** The double is declined — the offerer wins the current stake. */
  | { type: "DROP"; seat: Seat }
  | { type: "WIN"; seat: Seat; points: number };

const WHITE = 0;
const BLACK = 1;
const dir = (seat: Seat): 1 | -1 => (seat === WHITE ? -1 : 1); // index delta toward off
const opponent = (seat: Seat): 0 | 1 => (seat === WHITE ? BLACK : WHITE);

/** May `seat` offer a double now? Requires ownership (or a centered cube). */
function canDouble(s: BackgammonState, seat: Seat): boolean {
  return (
    s.phase === "ROLL" &&
    seat === s.turn &&
    s.cube < 64 &&
    (s.cubeOwner === null || s.cubeOwner === seat)
  );
}

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

/** Total pips the seat must still travel to bear off all checkers (bar = 25). */
function pipCount(s: BackgammonState, seat: 0 | 1): number {
  let pip = s.bar[seat] * 25;
  for (let i = 0; i < 24; i++) pip += ownCount(s, i, seat) * pipToOff(seat, i);
  return pip;
}

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
    cube: s.cube,
    cubeOwner: s.cubeOwner,
    winner: s.winner,
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
      cube: 1,
      cubeOwner: null,
      winner: null,
    };
  },

  legalActions(state, seat) {
    if (backgammonEngine.isTerminal(state)) return [];
    // An offered double is answered by the OTHER player (TAKE / DROP).
    if (state.phase === "DOUBLE") {
      return seat === opponent(state.turn) ? [{ type: "TAKE" }, { type: "DROP" }] : [];
    }
    if (seat !== state.turn) return [];
    if (state.phase === "ROLL") {
      const acts: BackgammonAction[] = [{ type: "ROLL" }];
      if (canDouble(state, seat)) acts.push({ type: "DOUBLE" });
      return acts;
    }
    const moves = movesFor(state);
    if (moves.length === 0) return [{ type: "PASS" }];
    return moves.map((m) => ({ type: "MOVE", from: m.from, die: m.die }));
  },

  reduce(state, action, rng: SeededRng) {
    const seat = state.turn as 0 | 1;

    if (action.type === "DOUBLE") {
      if (!canDouble(state, seat)) throw new IllegalActionError("Cannot double now");
      const next = clone(state);
      next.phase = "DOUBLE";
      return { state: next, events: [{ type: "DOUBLE", seat, value: next.cube * 2 }] };
    }

    if (action.type === "TAKE" || action.type === "DROP") {
      if (state.phase !== "DOUBLE") throw new IllegalActionError("No double to answer");
      const responder = opponent(seat); // the offerer is `seat` (the turn holder)
      const next = clone(state);
      if (action.type === "TAKE") {
        next.cube *= 2;
        next.cubeOwner = responder; // ownership passes to the taker
        next.phase = "ROLL"; // the offerer still owes their roll
        return { state: next, events: [{ type: "TAKE", seat: responder, value: next.cube }] };
      }
      // DROP: the offerer wins the current (un-doubled) stake outright.
      next.winner = seat;
      return {
        state: next,
        events: [
          { type: "DROP", seat: responder },
          { type: "WIN", seat, points: next.cube },
        ],
      };
    }

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
      events.push({ type: "WIN", seat, points: winPoints(next, seat) * next.cube });
    } else if (next.remaining.length === 0 || movesFor(next).length === 0) {
      endTurn(next);
    }

    return { state: next, events };
  },

  isTerminal(state) {
    return state.off[0] === 15 || state.off[1] === 15 || state.winner !== null;
  },

  score(state): SeatScore[] {
    const winner = (state.winner ?? (state.off[0] === 15 ? WHITE : BLACK)) as 0 | 1;
    const loser = opponent(winner);
    // A bear-off win multiplies gammon/backgammon by the cube; a dropped double
    // concedes exactly the current cube value (no gammon multiplier).
    const points =
      state.off[winner] === 15 ? winPoints(state, winner) * state.cube : state.cube;
    return [
      { seat: winner, result: "win", points },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  redact(state) {
    return state;
  },

  /** Heuristic bot: roll when asked; otherwise pick the move that (in priority)
   *  bears off, enters from the bar, hits an enemy blot, makes a safe point, and
   *  otherwise advances the rearmost checker. Beats uniform-random by a mile. */
  bot(state, seat) {
    if (backgammonEngine.isTerminal(state)) return null;
    // Answer an offered double: take from any reasonable position, drop only
    // when hopelessly behind on the pip count.
    if (state.phase === "DOUBLE") {
      if (seat !== opponent(state.turn)) return null;
      const me = pipCount(state, seat as 0 | 1);
      const them = pipCount(state, opponent(seat));
      return me <= them * 1.6 ? { type: "TAKE" } : { type: "DROP" };
    }
    if (seat !== state.turn) return null;
    if (state.phase === "ROLL") {
      // Conservative: only double from a clear pip lead and a still-low cube.
      if (canDouble(state, seat)) {
        const me = pipCount(state, seat as 0 | 1);
        const them = pipCount(state, opponent(seat as 0 | 1));
        if (state.cube <= 4 && me * 3 <= them * 2) return { type: "DOUBLE" };
      }
      return { type: "ROLL" };
    }
    const actions = backgammonEngine.legalActions(state, seat) as BackgammonAction[];
    const moves = actions.filter((a): a is Extract<BackgammonAction, { type: "MOVE" }> => a.type === "MOVE");
    if (moves.length === 0) return { type: "PASS" };
    const opp = (1 - seat) as 0 | 1;
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const m of moves) {
      const dest = m.from === "BAR" ? barEntry(seat as 0 | 1, m.die) : destOf(seat as 0 | 1, m.from, m.die);
      let s = 0;
      if (dest === "OFF") s += 120;
      else {
        if (ownCount(state, dest, opp) === 1) s += 60; // hit an enemy blot
        if (ownCount(state, dest, seat) >= 1) s += 25; // land safe on own point
        if (ownCount(state, dest, seat) === 0 && ownCount(state, dest, opp) === 0) s -= 8; // leaves a blot
      }
      if (m.from === "BAR") s += 40; // entering is urgent
      else s += (seat === WHITE ? m.from : 23 - m.from) * 0.5; // advance rear checkers
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    return best;
  },
};
