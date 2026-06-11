import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Морски бой (Battleship) — 2p grid guess (§4.15). 10x10 boards. Fleets are
 * placed randomly by the engine at init (server-authoritative; no client
 * placement to keep S7 scope tight — manual placement is later polish). Players
 * alternate FIRE at a cell on the opponent's grid; a hit grants another shot is
 * NOT used (classic alternating). Sink all opponent ships to win. Opponents'
 * ship positions are redacted — only hits/misses are revealed.
 */

const SIZE = 10;
const FLEET = [5, 4, 3, 3, 2]; // ship lengths

export interface BattleshipState {
  // ships[seat]: set of occupied cell indices (0..99)
  ships: number[][];
  // shots[seat]: cells this seat has fired at on the OPPONENT board
  shots: number[][];
  hits: number[][]; // subset of shots that hit
  turn: Seat;
  winner: Seat | null;
  done: boolean;
}

export type BattleshipAction = { type: "FIRE"; cell: number };
export type BattleshipEvent =
  | { type: "FIRE"; seat: Seat; cell: number; hit: boolean }
  | { type: "SUNK_ALL"; seat: Seat }
  | { type: "WIN"; seat: Seat };

const rc = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE];
const idx = (r: number, c: number): number => r * SIZE + c;

function placeFleet(rng: SeededRng): number[] {
  const occupied = new Set<number>();
  for (const len of FLEET) {
    let placed = false;
    for (let attempt = 0; attempt < 500 && !placed; attempt++) {
      const horiz = rng.int(2) === 0;
      const r = rng.int(SIZE);
      const c = rng.int(SIZE);
      const cells: number[] = [];
      for (let k = 0; k < len; k++) {
        const rr = horiz ? r : r + k;
        const cc = horiz ? c + k : c;
        if (rr >= SIZE || cc >= SIZE) {
          cells.length = 0;
          break;
        }
        cells.push(idx(rr, cc));
      }
      if (cells.length === len && cells.every((x) => !occupied.has(x))) {
        for (const x of cells) occupied.add(x);
        placed = true;
      }
    }
  }
  return [...occupied];
}

export const battleshipEngine: GameEngine<
  BattleshipState,
  BattleshipAction,
  BattleshipEvent
> = {
  init(_opts: InitOpts, rng: SeededRng): BattleshipState {
    return {
      ships: [placeFleet(rng), placeFleet(rng)],
      shots: [[], []],
      hits: [[], []],
      turn: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const fired = new Set(state.shots[seat]!);
    const actions: BattleshipAction[] = [];
    for (let cell = 0; cell < SIZE * SIZE; cell++) {
      if (!fired.has(cell)) actions.push({ type: "FIRE", cell });
    }
    return actions;
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "FIRE") throw new IllegalActionError("Only FIRE");
    const seat = state.turn;
    const opp: Seat = seat === 0 ? 1 : 0;
    if (action.cell < 0 || action.cell >= SIZE * SIZE) throw new IllegalActionError("Out of board");
    if (state.shots[seat]!.includes(action.cell)) throw new IllegalActionError("Already fired there");

    const next: BattleshipState = {
      ...state,
      shots: state.shots.map((s) => s.slice()),
      hits: state.hits.map((h) => h.slice()),
    };
    const hit = next.ships[opp]!.includes(action.cell);
    next.shots[seat]!.push(action.cell);
    if (hit) next.hits[seat]!.push(action.cell);
    const events: BattleshipEvent[] = [{ type: "FIRE", seat, cell: action.cell, hit }];

    // Win when all opponent ship cells are hit.
    const allSunk = next.ships[opp]!.every((cell) => next.hits[seat]!.includes(cell));
    if (allSunk) {
      events.push({ type: "SUNK_ALL", seat });
      events.push({ type: "WIN", seat });
      return { state: { ...next, winner: seat, done: true }, events };
    }

    next.turn = opp;
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    const loser: Seat = winner === 0 ? 1 : 0;
    return [
      { seat: winner, result: "win", points: 1 },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  redact(state, seat) {
    // Reveal only this seat's own ships; the opponent's fleet stays hidden.
    const ships = state.ships.map((s, i) => (i === seat ? s.slice() : []));
    return { ...state, ships };
  },
};

export { rc as battleshipRC };
