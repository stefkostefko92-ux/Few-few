import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Бинго (Bingo) — N-player broadcast draw (§4.17). Each player gets a 5x5 card
 * (center free). A shared, pre-seeded draw order reveals numbers 1..75; the
 * only action is DRAW (any seat may advance, or a bot/host). A player wins when
 * a full row, column, or diagonal is marked; simultaneous bingos on the same
 * ball all win. Cards are public, but the FUTURE draw order is not: redact
 * strips `drawOrder` so no client can precompute the winner (§7.2).
 */

const FREE = -1;

export interface BingoState {
  cards: number[][]; // per seat: 25 cells (index 12 = FREE)
  drawOrder: number[]; // pre-seeded full sequence of 75 numbers (server-only; redacted)
  drawn: number[]; // numbers drawn so far
  pos: number; // index into drawOrder
  seats: number;
  winners: Seat[]; // every seat that completed a line on the winning ball
  winner: Seat | null; // first winner (kept for compatibility)
  done: boolean;
}

export type BingoAction = { type: "DRAW" };
export type BingoEvent =
  | { type: "DRAW"; number: number }
  | { type: "WIN"; seat: Seat };

const LINES: number[][] = buildLines();

function makeCard(rng: SeededRng): number[] {
  // Standard B-I-N-G-O columns of ranges, 5 numbers each.
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const cols: number[][] = ranges.map(([lo, hi]) => {
    const pool: number[] = [];
    for (let n = lo!; n <= hi!; n++) pool.push(n);
    return rng.shuffle(pool).slice(0, 5);
  });
  const card: number[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) card.push(cols[c]![r]!);
  card[12] = FREE;
  return card;
}

export const bingoEngine: GameEngine<BingoState, BingoAction, BingoEvent> = {
  init(opts: InitOpts, rng: SeededRng): BingoState {
    const seats = Math.min(Math.max(opts.seats, 1), 8);
    const all: number[] = [];
    for (let n = 1; n <= 75; n++) all.push(n);
    return {
      cards: Array.from({ length: seats }, () => makeCard(rng)),
      drawOrder: rng.shuffle(all),
      drawn: [],
      pos: 0,
      seats,
      winners: [],
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    // Any seat on turn 0 may advance the shared draw; we keep it to seat 0 so the
    // realtime host / a single bot drives draws deterministically.
    if (state.done || seat !== 0) return [];
    return state.pos < state.drawOrder.length ? [{ type: "DRAW" }] : [];
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "DRAW") throw new IllegalActionError("Only DRAW");
    if (state.pos >= state.drawOrder.length) throw new IllegalActionError("Bag empty");

    const next: BingoState = { ...state, drawn: state.drawn.slice() };
    const number = next.drawOrder[next.pos]!;
    next.drawn.push(number);
    next.pos += 1;
    const events: BingoEvent[] = [{ type: "DRAW", number }];

    // Check every seat for a completed line — simultaneous bingos ALL win
    // (real bingo splits the prize; no seat-order tiebreak).
    const drawnSet = new Set(next.drawn);
    const winners: Seat[] = [];
    for (let seat = 0; seat < next.seats; seat++) {
      if (hasBingo(next.cards[seat]!, drawnSet)) winners.push(seat);
    }
    if (winners.length > 0) {
      for (const seat of winners) events.push({ type: "WIN", seat });
      return { state: { ...next, winners, winner: winners[0]!, done: true }, events };
    }
    if (next.pos >= next.drawOrder.length) {
      // Exhausted with no bingo (extremely unlikely) -> most marks wins (ties share).
      const most = mostMarks(next, drawnSet);
      for (const seat of most) events.push({ type: "WIN", seat });
      return { state: { ...next, winners: most, winner: most[0] ?? 0, done: true }, events };
    }
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winners = new Set(state.winners.length > 0 ? state.winners : [state.winner ?? 0]);
    return state.cards.map((_, seat) => ({
      seat,
      result: winners.has(seat) ? "win" : "loss",
      points: winners.has(seat) ? 1 : 0,
    }));
  },

  // Cards and drawn balls are public, but the pre-seeded FUTURE sequence must
  // never leave the server — a client could otherwise precompute the winner.
  redact: (s) => ({ ...s, drawOrder: [] }),
};

function marked(card: number[], cell: number, drawn: Set<number>): boolean {
  return card[cell] === FREE || drawn.has(card[cell]!);
}

function hasBingo(card: number[], drawn: Set<number>): boolean {
  return LINES.some((line) => line.every((cell) => marked(card, cell, drawn)));
}

function mostMarks(state: BingoState, drawn: Set<number>): Seat[] {
  const counts = state.cards.map(
    (card) => card.filter((_, cell) => marked(card, cell, drawn)).length,
  );
  const bestN = Math.max(...counts);
  return counts.flatMap((n, s) => (n === bestN ? [s] : []));
}

function buildLines(): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
}
