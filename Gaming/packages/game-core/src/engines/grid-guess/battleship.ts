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
 * 10x10 boards, classic fleet 1×4, 2×3, 3×2, 4×1; ships may NOT touch, not even
 * diagonally.
 *
 * Фаза на подреждане („PLACE“): всеки играч сам подрежда флота си и го изпраща
 * с `PLACE` (пълен списък кораби) — сървърът валидира формата (в полето, прави
 * линии, точният флот, без застъпване и без допиране, вкл. по диагонал). `PLACE_RANDOM`
 * оставя сървъра да подреди произволно (бутон „Случайно“ в UI, ботът и таймаутът
 * чрез бот-заместителя). Двамата подреждат едновременно (`validate` приема
 * действието от всеки неподредил играч); ходът по часовника е на първия неподредил,
 * с удължено време `config.turnSeconds` само за тази фаза. Стрелбата започва,
 * щом и двамата са готови.
 *
 * Фаза „FIRE“: играчите стрелят по полето на противника; попадение дава нов
 * изстрел (БГ правило), пропуск предава хода. Each ship is tracked as its own
 * cell list so sinking one raises a SUNK event. Opponent ship positions are
 * redacted — only their SUNK ships are revealed (and nothing during placement).
 */

const SIZE = 10;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]; // BG fleet: ship lengths
/** Време за подреждане (сек) — подава се на стаята чрез `config.turnSeconds`. */
export const BATTLESHIP_PLACE_SECONDS = 90;

export interface BattleshipState {
  /** „PLACE“ — подреждане; „FIRE“ — стрелба. Липсва в стари снимки → стрелба. */
  phase?: "PLACE" | "FIRE";
  /** Кой е изпратил валиден флот (публично — „Съперникът е готов“). */
  ready?: boolean[];
  /** Удължено време за ход по време на подреждането (стаята го чете). */
  config?: { turnSeconds: number };
  // ships[seat]: that seat's fleet — one entry per ship, each a list of cells (0..99)
  ships: number[][][];
  // shots[seat]: cells this seat has fired at on the OPPONENT board
  shots: number[][];
  hits: number[][]; // subset of shots that hit
  turn: Seat;
  winner: Seat | null;
  done: boolean;
}

export type BattleshipAction =
  | { type: "FIRE"; cell: number }
  | { type: "PLACE"; seat: Seat; ships: number[][] }
  | { type: "PLACE_RANDOM"; seat: Seat };
export type BattleshipEvent =
  | { type: "READY"; seat: Seat }
  | { type: "START"; seat: Seat }
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

/** Причина, поради която флотът е невалиден, или null за валиден флот. Приема
 *  НЕДОВЕРЕН вход (суров сокет) — проверява формата преди всичко останало. */
export function battleshipFleetError(ships: unknown): string | null {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return "fleet";
  const lens: number[] = [];
  for (const ship of ships) {
    if (!Array.isArray(ship) || ship.length < 1 || ship.length > 4) return "shape";
    for (const c of ship) {
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c >= SIZE * SIZE) return "bounds";
    }
    lens.push(ship.length);
  }
  const want = FLEET.slice().sort((a, b) => a - b).join(",");
  if (lens.slice().sort((a, b) => a - b).join(",") !== want) return "fleet";
  const owner = new Map<number, number>();
  for (let k = 0; k < ships.length; k++) {
    const ship = (ships[k] as number[]).slice().sort((a, b) => a - b);
    const rows = ship.map((c) => rc(c)[0]);
    const cols = ship.map((c) => rc(c)[1]);
    const horiz = rows.every((r) => r === rows[0]);
    const vert = cols.every((c) => c === cols[0]);
    if (!horiz && !vert) return "line";
    const line = horiz ? cols : rows;
    for (let i = 1; i < line.length; i++) if (line[i]! - line[i - 1]! !== 1) return "line";
    for (const c of ship) {
      if (owner.has(c)) return "overlap";
      owner.set(c, k);
    }
  }
  // Без допиране (и по диагонал): никоя съседна клетка не е от друг кораб.
  for (const [c, k] of owner) {
    for (const n of withNeighbours(c)) {
      const o = owner.get(n);
      if (o !== undefined && o !== k) return "touch";
    }
  }
  return null;
}

/** Random no-touch placement of the whole fleet; restarts from scratch rather
 *  than ever returning a partial fleet. */
export function placeFleet(rng: Pick<SeededRng, "int">): number[][] {
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
  init(_opts: InitOpts, _rng: SeededRng): BattleshipState {
    return {
      phase: "PLACE",
      ready: [false, false],
      config: { turnSeconds: BATTLESHIP_PLACE_SECONDS },
      ships: [[], []],
      shots: [[], []],
      hits: [[], []],
      turn: 0,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done) return [];
    if (state.phase === "PLACE") {
      // Изброимо е само „Случайно“; ръчният флот минава през `validate`.
      return state.ready?.[seat] === false ? [{ type: "PLACE_RANDOM", seat }] : [];
    }
    if (seat !== state.turn) return [];
    const fired = new Set(state.shots[seat]!);
    const actions: BattleshipAction[] = [];
    for (let cell = 0; cell < SIZE * SIZE; cell++) {
      if (!fired.has(cell)) actions.push({ type: "FIRE", cell });
    }
    return actions;
  },

  validate(state, seat, action) {
    if (typeof action !== "object" || action === null) return false;
    const a = action as { type?: unknown; seat?: unknown; ships?: unknown; cell?: unknown };
    if (state.done) return false;
    if (state.phase === "PLACE") {
      if (a.seat !== seat || state.ready?.[seat] !== false) return false;
      if (a.type === "PLACE_RANDOM") return true;
      return a.type === "PLACE" && battleshipFleetError(a.ships) === null;
    }
    if (a.type !== "FIRE" || seat !== state.turn) return false;
    const cell = a.cell;
    return (
      typeof cell === "number" &&
      Number.isInteger(cell) &&
      cell >= 0 &&
      cell < SIZE * SIZE &&
      !state.shots[seat]!.includes(cell)
    );
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    if (state.phase === "PLACE") {
      if (action.type !== "PLACE" && action.type !== "PLACE_RANDOM") {
        throw new IllegalActionError("Placement phase");
      }
      const who = action.seat;
      if (who !== 0 && who !== 1) throw new IllegalActionError("Bad seat");
      if (state.ready?.[who] !== false) throw new IllegalActionError("Already placed");
      let fleet: number[][];
      if (action.type === "PLACE") {
        if (battleshipFleetError(action.ships) !== null) throw new IllegalActionError("Invalid fleet");
        // Само валидираните клетки — никога суровия клиентски обект.
        fleet = action.ships.map((ship) => ship.map((c) => c));
      } else {
        fleet = placeFleet(rng);
      }
      const ships = state.ships.map((f) => f.map((sh) => sh.slice()));
      ships[who] = fleet;
      const ready = (state.ready ?? [false, false]).slice();
      ready[who] = true;
      const events: BattleshipEvent[] = [{ type: "READY", seat: who }];
      if (ready.every(Boolean)) {
        // И двамата са готови → стрелбата започва; удълженото време отпада.
        events.push({ type: "START", seat: state.turn });
        const started: BattleshipState = { ...state, ships, ready, phase: "FIRE" };
        delete started.config;
        return { state: started, events };
      }
      return { state: { ...state, ships, ready }, events };
    }
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
    if (state.done) return null;
    if (state.phase === "PLACE") {
      return state.ready?.[seat] === false ? { type: "PLACE_RANDOM", seat } : null;
    }
    if (seat !== state.turn) return null;
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
