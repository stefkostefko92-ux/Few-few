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
 * (center free). Числата 1..75 се теглят от СЪРВЪРА по таймер (`serverAction`
 * — стаята прилага `DRAW` на всеки BINGO_DRAW_MS); никой играч не тегли.
 *
 * Всеки играч САМ маркира изтеглените числа на своята карта (`MARK`) — сървърът
 * валидира, че числото е изтеглено, на неговата карта е и не е в наказание; по
 * избор `AUTO` включва помощно автомаркиране (само маркирането — викането остава
 * ръчно). Играчът ВИКА „Бинго!“ (`BINGO`): сървърът проверява линия (ред, колона
 * или диагонал) от НЕГОВИТЕ маркировки — сегашното печелившо правило.
 *
 * Вярно „Бинго!“ спира тегленето; до следващия тик (BINGO_CLOSE_MS) и други с
 * вярна линия могат да извикат — всички верни викания на същото число печелят
 * (както при едновременно бинго досега). Невярно „Бинго!“ → наказание: играчът
 * пропуска следващите PENALTY_DRAWS тегления — не може да маркира и вика, а
 * числата, изтеглени през наказанието, НЕ важат за него (не може да ги маркира
 * и по-късно). Изчерпан барабан без вярно бинго → реми за всички.
 *
 * Действията на играчите носят `seat`; `validate` го сверява с истинското място
 * (сокетът), така че никой не може да маркира чужда карта. `legalActions` е
 * празно за всички (иначе стаята би „дала хода“ на един играч и пуснала часовник
 * за него); ботовете действат чрез `bot()` в паузата преди следващото теглене.
 * Cards and marks are public, but the FUTURE draw order is not: redact strips
 * `drawOrder` so no client can precompute the winner (§7.2).
 */

const FREE = -1;
/** Интервал между две тегления (ms). */
export const BINGO_DRAW_MS = 4000;
/** Прозорец след първото вярно „Бинго!“, в който и други могат да извикат (ms). */
export const BINGO_CLOSE_MS = 2500;
/** Невярно „Бинго!“ → пропуск на толкова тегления. */
export const BINGO_PENALTY_DRAWS = 3;

export interface BingoState {
  cards: number[][]; // per seat: 25 cells (index 12 = FREE)
  drawOrder: number[]; // pre-seeded full sequence of 75 numbers (server-only; redacted)
  drawn: number[]; // numbers drawn so far
  pos: number; // index into drawOrder
  seats: number;
  /** Маркирани клетки (индекси 0..24, без свободното поле) — по място. */
  marks: number[][];
  /** Помощно автомаркиране, включено от играча. */
  auto: boolean[];
  /** Наказание: мястото е блокирано, докато `drawn.length < blockedUntil[seat]`. */
  blockedUntil: number[];
  /** Числа, изтеглени по време на наказание — не важат за това място. */
  voided: number[][];
  /** Брой неверни викания (за показване). */
  falseCalls: number[];
  /** Вярно „Бинго!“ е извикано — тегленето спря, тече прозорецът за още викания. */
  closing: boolean;
  winners: Seat[]; // every seat with a valid call on the winning ball
  winner: Seat | null; // first winner (kept for compatibility)
  done: boolean;
}

export type BingoAction =
  | { type: "DRAW" } // само сървърът (serverAction)
  | { type: "CLOSE" } // само сървърът (serverAction)
  | { type: "MARK"; seat: Seat; cell: number }
  | { type: "BINGO"; seat: Seat }
  | { type: "AUTO"; seat: Seat; on: boolean };
export type BingoEvent =
  | { type: "DRAW"; number: number }
  | { type: "MARK"; seat: Seat; cell: number }
  | { type: "AUTO"; seat: Seat; on: boolean }
  | { type: "BINGO_CALL"; seat: Seat; valid: boolean }
  | { type: "PENALTY"; seat: Seat; until: number }
  | { type: "WIN"; seat: Seat }
  | { type: "NO_WINNER" };

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

const isSeat = (state: BingoState, s: unknown): s is Seat =>
  typeof s === "number" && Number.isInteger(s) && s >= 0 && s < state.seats;

/** Мястото е в наказание (пропуска тегления). */
export function bingoBlocked(state: BingoState, seat: Seat): boolean {
  return state.drawn.length < (state.blockedUntil[seat] ?? 0);
}

/** Може ли `seat` да маркира клетка `cell` сега. */
function canMark(state: BingoState, seat: Seat, cell: number): boolean {
  if (state.done || bingoBlocked(state, seat)) return false;
  if (!Number.isInteger(cell) || cell < 0 || cell >= 25 || cell === 12) return false;
  const n = state.cards[seat]![cell]!;
  if (!state.drawn.includes(n)) return false;
  if (state.voided[seat]!.includes(n)) return false;
  return !state.marks[seat]!.includes(cell);
}

/** Има ли `seat` пълна линия от СОБСТВЕНИТЕ си маркировки. */
export function bingoHasLine(state: BingoState, seat: Seat): boolean {
  const marked = new Set(state.marks[seat]);
  marked.add(12);
  return LINES.some((line) => line.every((cell) => marked.has(cell)));
}

function canCall(state: BingoState, seat: Seat): boolean {
  if (state.done || bingoBlocked(state, seat)) return false;
  return !state.winners.includes(seat);
}

function cloneState(s: BingoState): BingoState {
  return {
    ...s,
    drawn: s.drawn.slice(),
    marks: s.marks.map((m) => m.slice()),
    auto: s.auto.slice(),
    blockedUntil: s.blockedUntil.slice(),
    voided: s.voided.map((v) => v.slice()),
    falseCalls: s.falseCalls.slice(),
    winners: s.winners.slice(),
  };
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
      marks: Array.from({ length: seats }, () => []),
      auto: new Array<boolean>(seats).fill(false),
      blockedUntil: new Array<number>(seats).fill(0),
      voided: Array.from({ length: seats }, () => []),
      falseCalls: new Array<number>(seats).fill(0),
      closing: false,
      winners: [],
      winner: null,
      done: false,
    };
  },

  // Никой играч няма „ход“ — всички действат едновременно чрез `validate`.
  legalActions: () => [],

  validate(state, seat, action) {
    if (state.done || typeof action !== "object" || action === null) return false;
    const a = action as { type?: unknown; seat?: unknown; cell?: unknown; on?: unknown };
    // DRAW/CLOSE идват само от сървъра; клиентът действа само за своето място.
    if (a.seat !== seat || !isSeat(state, a.seat)) return false;
    if (a.type === "MARK") return typeof a.cell === "number" && canMark(state, seat, a.cell);
    if (a.type === "BINGO") return canCall(state, seat);
    if (a.type === "AUTO") return typeof a.on === "boolean" && a.on !== state.auto[seat];
    return false;
  },

  serverAction(state) {
    if (state.done) return null;
    if (state.closing || state.pos >= state.drawOrder.length) {
      return { action: { type: "CLOSE" }, delayMs: BINGO_CLOSE_MS };
    }
    return { action: { type: "DRAW" }, delayMs: BINGO_DRAW_MS };
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    const next = cloneState(state);
    const events: BingoEvent[] = [];

    switch (action.type) {
      case "DRAW": {
        if (next.closing) throw new IllegalActionError("Round is closing");
        if (next.pos >= next.drawOrder.length) throw new IllegalActionError("Bag empty");
        const number = next.drawOrder[next.pos]!;
        // Числото пада по време на наказанието ли е → не важи за наказания.
        for (let s = 0; s < next.seats; s++) {
          if (bingoBlocked(next, s)) next.voided[s]!.push(number);
        }
        next.drawn.push(number);
        next.pos += 1;
        events.push({ type: "DRAW", number });
        // Помощно автомаркиране — само ако мястото не е в наказание.
        for (let s = 0; s < next.seats; s++) {
          if (!next.auto[s]) continue;
          const cell = next.cards[s]!.indexOf(number);
          if (cell >= 0 && canMark(next, s, cell)) {
            next.marks[s]!.push(cell);
            events.push({ type: "MARK", seat: s, cell });
          }
        }
        return { state: next, events };
      }
      case "CLOSE": {
        if (!next.closing && next.pos < next.drawOrder.length) {
          throw new IllegalActionError("Nothing to close");
        }
        next.done = true;
        if (next.winners.length === 0) events.push({ type: "NO_WINNER" });
        return { state: next, events };
      }
      case "MARK": {
        if (!isSeat(next, action.seat) || !canMark(next, action.seat, action.cell)) {
          throw new IllegalActionError("Cannot mark");
        }
        next.marks[action.seat]!.push(action.cell);
        events.push({ type: "MARK", seat: action.seat, cell: action.cell });
        return { state: next, events };
      }
      case "AUTO": {
        if (!isSeat(next, action.seat)) throw new IllegalActionError("Bad seat");
        next.auto[action.seat] = action.on === true;
        events.push({ type: "AUTO", seat: action.seat, on: next.auto[action.seat]! });
        return { state: next, events };
      }
      case "BINGO": {
        const seat = action.seat;
        if (!isSeat(next, seat) || !canCall(next, seat)) throw new IllegalActionError("Cannot call");
        const valid = bingoHasLine(next, seat);
        events.push({ type: "BINGO_CALL", seat, valid });
        if (valid) {
          next.winners.push(seat);
          if (next.winner === null) next.winner = seat;
          next.closing = true; // тегленето спира; другите имат прозорец до CLOSE
          events.push({ type: "WIN", seat });
          return { state: next, events };
        }
        next.falseCalls[seat] = (next.falseCalls[seat] ?? 0) + 1;
        next.blockedUntil[seat] = next.drawn.length + BINGO_PENALTY_DRAWS;
        events.push({ type: "PENALTY", seat, until: next.blockedUntil[seat]! });
        return { state: next, events };
      }
      default:
        throw new IllegalActionError("Unknown bingo action");
    }
  },

  /** Бот: маркира едно изтеглено число на ход, а с пълна линия вика „Бинго!“.
   *  Стаята го пуска в паузата преди следващото теглене — естествено закъснение. */
  bot(state, seat) {
    if (state.done || !isSeat(state, seat) || bingoBlocked(state, seat)) return null;
    if (!state.winners.includes(seat) && bingoHasLine(state, seat)) return { type: "BINGO", seat };
    const card = state.cards[seat]!;
    for (let cell = 0; cell < 25; cell++) {
      if (cell !== 12 && state.drawn.includes(card[cell]!) && canMark(state, seat, cell)) {
        return { type: "MARK", seat, cell };
      }
    }
    return null;
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    // Изчерпан барабан без вярно бинго → реми за всички.
    if (state.winners.length === 0) {
      return state.cards.map((_, seat) => ({ seat, result: "draw", points: 0 }));
    }
    const winners = new Set(state.winners);
    return state.cards.map((_, seat) => ({
      seat,
      result: winners.has(seat) ? "win" : "loss",
      points: winners.has(seat) ? 1 : 0,
    }));
  },

  // Cards, marks and drawn balls are public, but the pre-seeded FUTURE sequence
  // must never leave the server — a client could otherwise precompute the winner.
  redact: (s) => ({ ...s, drawOrder: [] }),
};

function buildLines(): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
}
