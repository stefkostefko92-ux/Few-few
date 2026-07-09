import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Покер на зарове (Yahtzee-style dice scoring) — 1–4p (§4.16). Each turn: ROLL
 * five dice, optionally re-roll a chosen subset up to twice (HOLD then ROLL),
 * then SCORE the result into one of 13 unused categories. Filling the upper
 * section (ones..sixes) to 63+ earns a +35 bonus. After every player fills all
 * 13 categories the highest total wins (equal totals draw). Original
 * naming/scoring; no trademarked assets (§2).
 */

export const CATEGORIES = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "chance", "yahtzee",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Ones..sixes — the section whose 63+ subtotal earns the +35 bonus. */
export const UPPER_CATEGORIES = CATEGORIES.slice(0, 6) as readonly Category[];
export const UPPER_BONUS = 35;
export const UPPER_BONUS_TARGET = 63;

export interface DiceState {
  dice: number[]; // 5 dice (0 = unrolled)
  /** Which dice the roller kept on their last re-roll — lets every seat watch
   *  the holds, not just the player toggling them locally. */
  held: boolean[];
  rerollsLeft: number;
  scores: Array<Partial<Record<Category, number>>>; // per seat
  turn: Seat;
  seats: number;
  rolledThisTurn: boolean;
  winner: Seat | null;
  done: boolean;
}

export type DiceAction =
  | { type: "ROLL"; hold?: boolean[] }
  | { type: "SCORE"; category: Category };

export type DiceEvent =
  | { type: "ROLL"; seat: Seat; dice: number[]; rerollsLeft: number }
  | { type: "SCORE"; seat: Seat; category: Category; points: number }
  | { type: "WIN"; seat: Seat }
  | { type: "DRAW"; seats: Seat[] };

const NO_HOLD: readonly boolean[] = [false, false, false, false, false];

const counts = (dice: number[]): number[] => {
  const c = new Array<number>(7).fill(0);
  for (const d of dice) c[d] = (c[d] ?? 0) + 1;
  return c;
};

export function scoreCategory(dice: number[], cat: Category): number {
  const c = counts(dice);
  const sum = dice.reduce((a, b) => a + b, 0);
  switch (cat) {
    case "ones": return (c[1] ?? 0) * 1;
    case "twos": return (c[2] ?? 0) * 2;
    case "threes": return (c[3] ?? 0) * 3;
    case "fours": return (c[4] ?? 0) * 4;
    case "fives": return (c[5] ?? 0) * 5;
    case "sixes": return (c[6] ?? 0) * 6;
    case "threeKind": return c.some((n) => n >= 3) ? sum : 0;
    case "fourKind": return c.some((n) => n >= 4) ? sum : 0;
    case "fullHouse": return c.includes(3) && c.includes(2) ? 25 : c.includes(5) ? 25 : 0;
    case "smallStraight": return hasStraight(c, 4) ? 30 : 0;
    case "largeStraight": return hasStraight(c, 5) ? 40 : 0;
    case "chance": return sum;
    case "yahtzee": return c.some((n) => n === 5) ? 50 : 0;
  }
}

function hasStraight(c: number[], len: number): boolean {
  let run = 0;
  for (let i = 1; i <= 6; i++) {
    run = (c[i] ?? 0) > 0 ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
}

/** Upper-section (ones..sixes) subtotal — drives the +35 bonus. */
export const upperTotal = (s: Partial<Record<Category, number>>): number =>
  UPPER_CATEGORIES.reduce((a, c) => a + (s[c] ?? 0), 0);

/** Grand total for one seat's sheet, upper-section bonus included. */
export const totalOf = (s: Partial<Record<Category, number>>): number =>
  CATEGORIES.reduce((a, c) => a + (s[c] ?? 0), 0) +
  (upperTotal(s) >= UPPER_BONUS_TARGET ? UPPER_BONUS : 0);

/** A well-formed optional hold mask: up to 5 booleans (shorter = rest false). */
function validHold(hold: unknown): boolean {
  if (hold === undefined) return true;
  return Array.isArray(hold) && hold.length <= 5 && hold.every((v) => typeof v === "boolean");
}

export const diceEngine: GameEngine<DiceState, DiceAction, DiceEvent> = {
  init(opts: InitOpts): DiceState {
    const seats = Math.min(Math.max(opts.seats, 1), 4);
    return {
      dice: [0, 0, 0, 0, 0],
      held: NO_HOLD.slice(),
      rerollsLeft: 2,
      scores: Array.from({ length: seats }, () => ({})),
      turn: 0,
      seats,
      rolledThisTurn: false,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const actions: DiceAction[] = [];
    if (!state.rolledThisTurn || state.rerollsLeft > 0) actions.push({ type: "ROLL" });
    if (state.rolledThisTurn) {
      for (const category of CATEGORIES) {
        if (state.scores[seat]![category] === undefined) actions.push({ type: "SCORE", category });
      }
    }
    return actions;
  },

  /** ROLL is parameterized by an arbitrary hold mask, so the room can't match
   *  it against the enumerated legal set — accept any well-formed hold here
   *  (the same way cue sports validate continuous shots). */
  validate(state, seat, action) {
    if (state.done || seat !== state.turn) return false;
    const a = action as DiceAction;
    if (a.type === "ROLL") {
      if (state.rolledThisTurn && state.rerollsLeft <= 0) return false;
      return validHold(a.hold);
    }
    if (a.type === "SCORE") {
      return (
        state.rolledThisTurn &&
        CATEGORIES.includes(a.category) &&
        state.scores[seat]![a.category] === undefined
      );
    }
    return false;
  },

  reduce(state, action, rng: SeededRng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: DiceState = {
      ...state,
      dice: state.dice.slice(),
      held: state.held.slice(),
      scores: state.scores.map((s) => ({ ...s })),
    };
    const events: DiceEvent[] = [];

    if (action.type === "ROLL") {
      if (next.rolledThisTurn && next.rerollsLeft <= 0) {
        throw new IllegalActionError("No rerolls left");
      }
      if (!validHold(action.hold)) throw new IllegalActionError("Malformed hold");
      const hold = action.hold ?? NO_HOLD;
      // The first roll of a turn tumbles all five dice; holds apply to re-rolls.
      next.held = NO_HOLD.map((_, i) => next.rolledThisTurn && hold[i] === true);
      for (let i = 0; i < 5; i++) {
        if (!next.held[i]) next.dice[i] = rng.die();
      }
      if (next.rolledThisTurn) next.rerollsLeft -= 1;
      next.rolledThisTurn = true;
      events.push({ type: "ROLL", seat, dice: next.dice.slice(), rerollsLeft: next.rerollsLeft });
      return { state: next, events };
    }

    // SCORE
    if (!next.rolledThisTurn) throw new IllegalActionError("Roll before scoring");
    if (next.scores[seat]![action.category] !== undefined) {
      throw new IllegalActionError("Category already used");
    }
    const pts = scoreCategory(next.dice, action.category);
    next.scores[seat]![action.category] = pts;
    events.push({ type: "SCORE", seat, category: action.category, points: pts });

    // Reset for the next player's turn.
    next.dice = [0, 0, 0, 0, 0];
    next.held = NO_HOLD.slice();
    next.rerollsLeft = 2;
    next.rolledThisTurn = false;
    next.turn = (seat + 1) % next.seats;

    if (next.scores.every((s) => CATEGORIES.every((c) => s[c] !== undefined))) {
      const tops = topSeats(next);
      if (tops.length === 1) {
        events.push({ type: "WIN", seat: tops[0]! });
        return { state: { ...next, winner: tops[0]!, done: true }, events };
      }
      // Equal totals — a draw between the tied seats, not two wins.
      events.push({ type: "DRAW", seats: tops });
      return { state: { ...next, winner: null, done: true }, events };
    }
    return { state: next, events };
  },

  /** Hold what we have the most of, chase the best open category. */
  bot(state, seat) {
    if (state.done || seat !== state.turn) return null;
    if (!state.rolledThisTurn) return { type: "ROLL" };

    const sheet = state.scores[seat]!;
    const open = CATEGORIES.filter((c) => sheet[c] === undefined);
    if (open.length === 0) return null;
    const isUpper = (c: Category) => UPPER_CATEGORIES.includes(c);
    let best: Category = open[0]!;
    let bestPts = -1;
    for (const c of open) {
      const pts = scoreCategory(state.dice, c);
      // Ties prefer the upper section — it feeds the +35 bonus.
      if (pts > bestPts || (pts === bestPts && isUpper(c) && !isUpper(best))) {
        best = c;
        bestPts = pts;
      }
    }

    // Nothing lucrative yet and re-rolls remain: keep the most frequent face
    // (higher pips break ties) and tumble the rest.
    if (state.rerollsLeft > 0 && bestPts < 25) {
      const c = counts(state.dice);
      let face = 1;
      for (let f = 2; f <= 6; f++) if ((c[f] ?? 0) >= (c[face] ?? 0)) face = f;
      const keep = (c[face] ?? 0) >= 2;
      return { type: "ROLL", hold: state.dice.map((d) => keep && d === face) };
    }
    return { type: "SCORE", category: best };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const totals = state.scores.map(totalOf);
    const max = Math.max(...totals);
    const tied = totals.filter((t) => t === max).length > 1;
    return totals.map((t, seat) => ({
      seat,
      result: t === max ? (tied ? "draw" : "win") : "loss",
      points: t,
    }));
  },

  redact: (s) => s, // open information
};

/** All seats sharing the highest grand total (one seat = outright winner). */
function topSeats(state: DiceState): Seat[] {
  const totals = state.scores.map(totalOf);
  const max = Math.max(...totals);
  return totals.flatMap((t, seat) => (t === max ? [seat] : []));
}
