import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Домино (block dominoes) — 2–4p tile game (§4.13). Double-six set (28 tiles).
 * Each player draws 7 (2p) or fewer for more players; the rest is the boneyard.
 * On your turn play a matching tile onto either open end, or DRAW from the
 * boneyard, or PASS if you cannot play and the boneyard is empty. First to
 * empty their hand wins; if blocked, lowest pip-count wins. Hands + boneyard
 * are redacted.
 *
 * A tile is "a-b" with a<=b. Ends of the line track the open pip values.
 */

export type Tile = string; // "a-b", a<=b

export interface DominoState {
  hands: Tile[][];
  boneyard: Tile[];
  line: Tile[]; // played tiles in order
  ends: [number, number] | null; // open pip values [left, right]
  turn: Seat;
  seats: number;
  passes: number; // consecutive passes -> blocked
  winner: Seat | null;
  done: boolean;
}

export type DominoAction =
  | { type: "PLAY"; tile: Tile; side: "L" | "R" }
  | { type: "DRAW" }
  | { type: "PASS" };

export type DominoEvent =
  | { type: "PLAY"; seat: Seat; tile: Tile; side: "L" | "R" }
  | { type: "DRAW"; seat: Seat }
  | { type: "PASS"; seat: Seat }
  | { type: "WIN"; seat: Seat; reason: "out" | "blocked" };

const pips = (t: Tile): [number, number] => {
  const [a, b] = t.split("-").map(Number) as [number, number];
  return [a, b];
};
const tilePipSum = (t: Tile): number => {
  const [a, b] = pips(t);
  return a + b;
};

function fullSet(): Tile[] {
  const set: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push(`${a}-${b}`);
  return set;
}

/** Which sides a tile can attach to, given the open ends. */
function playableSides(tile: Tile, ends: [number, number] | null): Array<"L" | "R"> {
  if (!ends) return ["L"]; // first tile — anywhere, normalise to L
  const [a, b] = pips(tile);
  const sides: Array<"L" | "R"> = [];
  if (a === ends[0] || b === ends[0]) sides.push("L");
  if (a === ends[1] || b === ends[1]) sides.push("R");
  return sides;
}

export const dominoEngine: GameEngine<DominoState, DominoAction, DominoEvent> = {
  init(opts: InitOpts, rng: SeededRng): DominoState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    const shuffled = rng.shuffle(fullSet());
    const handSize = seats <= 2 ? 7 : 5;
    const hands: Tile[][] = [];
    for (let s = 0; s < seats; s++) hands.push(shuffled.splice(0, handSize));
    return {
      hands,
      boneyard: shuffled,
      line: [],
      ends: null,
      turn: 0,
      seats,
      passes: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const hand = state.hands[seat]!;
    const plays: DominoAction[] = [];
    for (const tile of hand) {
      for (const side of playableSides(tile, state.ends)) {
        plays.push({ type: "PLAY", tile, side });
      }
    }
    if (plays.length > 0) return plays;
    // Can't play: draw if boneyard has tiles, else pass.
    return state.boneyard.length > 0 ? [{ type: "DRAW" }] : [{ type: "PASS" }];
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: DominoState = {
      ...state,
      hands: state.hands.map((h) => h.slice()),
      boneyard: state.boneyard.slice(),
      line: state.line.slice(),
      ends: state.ends ? [state.ends[0], state.ends[1]] : null,
    };
    const events: DominoEvent[] = [];

    if (action.type === "DRAW") {
      if (next.boneyard.length === 0) throw new IllegalActionError("Boneyard empty");
      const t = next.boneyard.shift()!;
      next.hands[seat]!.push(t);
      events.push({ type: "DRAW", seat });
      next.passes = 0;
      // Turn stays with the player to try to play the drawn tile.
      return { state: next, events };
    }

    if (action.type === "PASS") {
      if (playableActions(next, seat).length > 0 || next.boneyard.length > 0) {
        throw new IllegalActionError("Cannot pass when a move exists");
      }
      events.push({ type: "PASS", seat });
      next.passes += 1;
      if (next.passes >= next.seats) return blockedFinish(next, events);
      next.turn = (seat + 1) % next.seats;
      return { state: next, events };
    }

    // PLAY
    const hand = next.hands[seat]!;
    if (!hand.includes(action.tile)) throw new IllegalActionError("Tile not in hand");
    const sides = playableSides(action.tile, next.ends);
    if (!sides.includes(action.side)) throw new IllegalActionError("Tile does not fit that side");

    next.hands[seat] = hand.filter((t) => t !== action.tile);
    const [a, b] = pips(action.tile);
    if (!next.ends) {
      next.ends = [a, b];
      next.line.push(action.tile);
    } else if (action.side === "L") {
      // The matching pip joins the left end; the other becomes the new left end.
      next.ends[0] = a === next.ends[0] ? b : a;
      next.line.unshift(action.tile);
    } else {
      next.ends[1] = a === next.ends[1] ? b : a;
      next.line.push(action.tile);
    }
    events.push({ type: "PLAY", seat, tile: action.tile, side: action.side });
    next.passes = 0;

    if (next.hands[seat]!.length === 0) {
      events.push({ type: "WIN", seat, reason: "out" });
      return { state: { ...next, winner: seat, done: true }, events };
    }

    next.turn = (seat + 1) % next.seats;
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner =
      state.winner ?? lowestPipSeat(state);
    return state.hands.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: seat === winner ? 1 : 0,
    }));
  },

  redact(state, seat) {
    const hands = state.hands.map((h, i) => (i === seat ? h.slice() : h.map(() => "?")));
    return { ...state, hands, boneyard: state.boneyard.map(() => "?") };
  },
};

function playableActions(state: DominoState, seat: Seat): DominoAction[] {
  const hand = state.hands[seat]!;
  const plays: DominoAction[] = [];
  for (const tile of hand) {
    for (const side of playableSides(tile, state.ends)) plays.push({ type: "PLAY", tile, side });
  }
  return plays;
}

function lowestPipSeat(state: DominoState): Seat {
  let best = 0;
  let bestSum = Infinity;
  for (let s = 0; s < state.seats; s++) {
    const sum = state.hands[s]!.reduce((a, t) => a + tilePipSum(t), 0);
    if (sum < bestSum) {
      bestSum = sum;
      best = s;
    }
  }
  return best;
}

function blockedFinish(
  state: DominoState,
  events: DominoEvent[],
): { state: DominoState; events: DominoEvent[] } {
  const winner = lowestPipSeat(state);
  events.push({ type: "WIN", seat: winner, reason: "blocked" });
  return { state: { ...state, winner, done: true }, events };
}
