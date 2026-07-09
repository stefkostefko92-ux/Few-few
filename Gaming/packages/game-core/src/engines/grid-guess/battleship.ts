import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Морски бой (Battleship) — 2p grid guess (§4.15), Bulgarian schoolyard rules.
 * 10x10 boards, classic fleet 1×4, 2×3, 3×2, 4×1. Fleets are placed randomly by
 * the engine at init (server-authoritative; manual placement is later polish)
 * and ships may NOT touch, not even diagonally. Players FIRE at the opponent's
 * grid; a HIT grants another shot (БГ rule), a miss passes the turn. Each ship
 * is tracked as its own cell list so sinking one raises a SUNK event. Opponent
 * ship positions are redacted — only their SUNK ships are revealed.
 */

const SIZE = 10;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]; // BG fleet: ship lengths

export interface BattleshipState {
  // ships[seat]: that seat's fleet — one entry per ship, each a list of cells (0..99)
  ships: number[][][];
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
  | { type: "SUNK"; seat: Seat; cells: number[] }
  | { type: "SUNK_ALL"; seat: Seat }
  | { type: "WIN"; seat: Seat };

const rc = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE];
const idx = (r: number, c: number): number => r * SIZE + c;

/** The cell plus its 8 neighbours (clipped to the board). */
function withNeighbours(cell: number): number[] {
  const [r, c] = rc(cell);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(idx(rr, cc));
    }
  }
  return out;
}

/** Random no-touch placement of the whole fleet; restarts from scratch rather
 *  than ever returning a partial fleet. */
function placeFleet(rng: SeededRng): number[][] {
  for (;;) {
    const ships: number[][] = [];
    const blocked = new Set<number>(); // occupied cells + their halo (no-touch rule)
    let ok = true;
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
        if (cells.length === len && cells.every((x) => !blocked.has(x))) {
          ships.push(cells);
          for (const x of cells) for (const n of withNeighbours(x)) blocked.add(n);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
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
    const struck = next.ships[opp]!.find((ship) => ship.includes(action.cell));
    const hit = struck !== undefined;
    next.shots[seat]!.push(action.cell);
    if (hit) next.hits[seat]!.push(action.cell);
    const events: BattleshipEvent[] = [{ type: "FIRE", seat, cell: action.cell, hit }];

    if (struck) {
      const hitSet = new Set(next.hits[seat]!);
      if (struck.every((cell) => hitSet.has(cell))) {
        events.push({ type: "SUNK", seat, cells: struck.slice() });
      }
      // Win when every opponent ship cell is hit.
      const allSunk = next.ships[opp]!.every((ship) => ship.every((cell) => hitSet.has(cell)));
      if (allSunk) {
        events.push({ type: "SUNK_ALL", seat });
        events.push({ type: "WIN", seat });
        return { state: { ...next, winner: seat, done: true }, events };
      }
      // БГ rule: a hit grants another shot — the turn stays with the shooter.
      return { state: next, events };
    }

    next.turn = opp;
    return { state: next, events };
  },

  /** Hunt/target AI: finish wounded (hit but unsunk) ships by firing at an
   *  orthogonal neighbour of a hit; otherwise a random unshot cell, skipping
   *  cells adjacent to sunk ships (no-touch placement guarantees them empty). */
  bot(state, seat, rng) {
    if (state.done || seat !== state.turn) return null;
    const opp: Seat = seat === 0 ? 1 : 0;
    const shot = new Set(state.shots[seat]!);
    const hitSet = new Set(state.hits[seat]!);

    const sunkCells = new Set<number>();
    for (const ship of state.ships[opp]!) {
      if (ship.every((c) => hitSet.has(c))) for (const c of ship) sunkCells.add(c);
    }
    // Cells hugging a sunk ship are provably empty (no-touch placement).
    const halo = new Set<number>();
    for (const c of sunkCells) for (const n of withNeighbours(c)) halo.add(n);

    // Target mode: orthogonal neighbours of any unsunk hit.
    const targets: number[] = [];
    for (const h of state.hits[seat]!) {
      if (sunkCells.has(h)) continue;
      const [r, c] = rc(h);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
        const t = idx(rr, cc);
        if (!shot.has(t) && !halo.has(t) && !targets.includes(t)) targets.push(t);
      }
    }
    if (targets.length > 0) return { type: "FIRE", cell: targets[rng.int(targets.length)]! };

    // Hunt mode: any unshot cell not hugging a sunk ship (those are empty).
    const smart: number[] = [];
    const any: number[] = [];
    for (let cell = 0; cell < SIZE * SIZE; cell++) {
      if (shot.has(cell)) continue;
      any.push(cell);
      if (!halo.has(cell)) smart.push(cell);
    }
    const pool = smart.length > 0 ? smart : any;
    if (pool.length === 0) return null;
    return { type: "FIRE", cell: pool[rng.int(pool.length)]! };
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
    // Reveal my own fleet in full; of the opponent's, only SUNK ships (their
    // cells are all hit anyway — the grouping is what the SUNK banner announced).
    const myHits = new Set(state.hits[seat] ?? []);
    const ships = state.ships.map((fleet, i) =>
      i === seat
        ? fleet.map((ship) => ship.slice())
        : fleet.filter((ship) => ship.every((c) => myHits.has(c))).map((ship) => ship.slice()),
    );
    return { ...state, ships };
  },
};

export { rc as battleshipRC };
