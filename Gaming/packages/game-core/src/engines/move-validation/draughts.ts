import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Дама / Draughts — 2p abstract on 8x8 dark squares (§4.9). **Руска дама**
 * (шашки) — най-играният вариант в България:
 *   - 8×8, по 12 пула; белите започват. Обикновените пулове ходят напред по
 *     диагонал с едно поле, но ВЗЕМАТ и напред, и назад.
 *   - Вземането е задължително, но със **свободен избор**: играчът избира коя
 *     поредица да изиграе (няма правило за максимум). Започнатата поредица се
 *     довършва — пулът продължава, докато има какво да вземе.
 *   - Пул, стигнал последния ред ПО ВРЕМЕ на вземане, става дама **веднага** и
 *     продължава поредицата вече като дама.
 *   - Дамата е „летяща“: плъзга се произволно далеч, взема отдалеч и каца на
 *     всяко свободно поле след взетия пул — освен ако от някое от тях може да
 *     продължи вземането: тогава е длъжна да кацне на такова поле.
 *   - „Турски удар“: взетите пулове ОСТАВАТ на дъската до края на поредицата
 *     (`pending`) — не могат да се вземат повторно (един пул не се прескача два
 *     пъти), дамата не минава през тях, и се махат всички наведнъж накрая.
 *   - Реми (приложено опростено от руския правилник): 15 хода на всяка страна
 *     (30 полухода) само с дами, без вземане и без ход на обикновен пул; както и
 *     трикратно повторение на позицията (същата дъска, същият на ход). Особените
 *     ендшпилни броения (напр. 3 дами срещу 1) не са включени.
 *
 * Board: 64 cells indexed 0..63 (row*8+col). Seat 0 = white (moves up, toward
 * row 0), seat 1 = black (moves down). Only dark squares hold pieces.
 */

type Piece = "w" | "W" | "b" | "B" | null; // upper = king

export interface DraughtsState {
  board: Piece[];
  turn: Seat;
  /** Mid-chain: the only piece allowed to act is the one at this cell. */
  chainFrom: number | null;
  winner: Seat | null;
  done: boolean;
  /** Последователни полуходове само с дами без вземане; нулира се от всяко
   *  вземане и от всеки ход на обикновен пул. 30 (15 на страна) → реми. */
  noCaptureMoves: number;
  /** Взети в текущата верига пулове — още на дъската, махат се в края й. */
  pending?: number[];
  /** Ключове на позициите след последния необратим ход (вземане / ход на
   *  пул) — за трикратното повторение. */
  positions?: string[];
}

/** 15 хода на всяка страна само с дами → реми (руски правила). */
export const KING_ONLY_DRAW_PLIES = 30;

export type DraughtsAction = { type: "MOVE"; from: number; to: number };
export type DraughtsEvent =
  | { type: "MOVE"; seat: Seat; from: number; to: number; captured: number | null }
  | { type: "KING"; seat: Seat; at: number }
  | { type: "WIN"; seat: Seat }
  | { type: "DRAW" };

const rc = (i: number): [number, number] => [Math.floor(i / 8), i % 8];
const idx = (r: number, c: number): number => r * 8 + c;
const inBounds = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
const owner = (p: Piece | undefined): Seat | null =>
  p === "w" || p === "W" ? 0 : p === "b" || p === "B" ? 1 : null;
const isKing = (p: Piece | undefined): boolean => p === "W" || p === "B";

function startBoard(): Piece[] {
  const board: Piece[] = new Array<Piece>(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const [r, c] = rc(i);
    if ((r + c) % 2 === 0) continue; // light square
    if (r <= 2) board[i] = "b";
    else if (r >= 5) board[i] = "w";
  }
  return board;
}

/** Forward row directions for a seat's men (plain steps only — captures go both ways). */
const dirsFor = (p: Piece | undefined): number[] => {
  if (p === "w") return [-1];
  if (p === "b") return [1];
  return [-1, 1]; // kings
};

interface Move {
  from: number;
  to: number;
  captured: number | null;
}

/** Позицията за трикратното повторение: дъската + кой е на ход. */
const positionKey = (board: Piece[], turn: Seat): string =>
  `${board.map((p) => p ?? ".").join("")}|${turn}`;

/** Сурови скокове от едно поле (пул: и напред, и назад; дама: летяща, всички
 *  приземявания). Пуловете в `pending` още стоят на дъската: блокират пътя и не
 *  могат да бъдат взети втори път („турски удар“). */
function rawCapturesFrom(board: Piece[], i: number, seat: Seat, pending: readonly number[]): Move[] {
  const out: Move[] = [];
  const p = board[i];
  if (owner(p) !== seat) return out;
  const [r, c] = rc(i);
  for (const dr of [-1, 1] as const) {
    for (const dc of [-1, 1] as const) {
      if (isKing(p)) {
        // Flying king: slide to the first piece on this diagonal; if it is an
        // enemy with empty squares behind, every one of them is a landing.
        let r1 = r + dr;
        let c1 = c + dc;
        while (inBounds(r1, c1) && board[idx(r1, c1)] === null) {
          r1 += dr;
          c1 += dc;
        }
        if (!inBounds(r1, c1) || owner(board[idx(r1, c1)]) === seat) continue;
        const mid = idx(r1, c1);
        if (pending.includes(mid)) continue; // вече взет — стена, не жертва
        let r2 = r1 + dr;
        let c2 = c1 + dc;
        while (inBounds(r2, c2) && board[idx(r2, c2)] === null) {
          out.push({ from: i, to: idx(r2, c2), captured: mid });
          r2 += dr;
          c2 += dc;
        }
      } else {
        // Обикновеният пул взема съседен противник напред И назад.
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (!inBounds(lr, lc)) continue;
        const mid = idx(r + dr, c + dc);
        const midOwner = owner(board[mid]);
        if (
          midOwner !== null &&
          midOwner !== seat &&
          !pending.includes(mid) &&
          board[idx(lr, lc)] === null
        ) {
          out.push({ from: i, to: idx(lr, lc), captured: mid });
        }
      }
    }
  }
  return out;
}

/** Законните скокове от едно поле. Руско правило за дамата: ако след вземането
 *  на даден пул от някое приземяване може да се продължи, само тези приземявания
 *  са позволени (длъжна е да продължи); иначе — всяко свободно поле. */
function capturesFrom(board: Piece[], i: number, seat: Seat, pending: readonly number[] = []): Move[] {
  const raw = rawCapturesFrom(board, i, seat, pending);
  if (!isKing(board[i]) || raw.length <= 1) return raw;
  const out: Move[] = [];
  const byVictim = new Map<number, Move[]>();
  for (const m of raw) {
    const list = byVictim.get(m.captured!) ?? [];
    list.push(m);
    byVictim.set(m.captured!, list);
  }
  for (const group of byVictim.values()) {
    const continuing = group.filter((m) => !applied(board, pending, m, seat).ends);
    out.push(...(continuing.length > 0 ? continuing : group));
  }
  return out;
}

/** Simple (non-capturing) steps from a single square (kings slide any distance). */
function stepsFrom(board: Piece[], i: number, seat: Seat): Move[] {
  const out: Move[] = [];
  const p = board[i];
  if (owner(p) !== seat) return out;
  const [r, c] = rc(i);
  if (isKing(p)) {
    for (const dr of [-1, 1] as const) {
      for (const dc of [-1, 1] as const) {
        let r1 = r + dr;
        let c1 = c + dc;
        while (inBounds(r1, c1) && board[idx(r1, c1)] === null) {
          out.push({ from: i, to: idx(r1, c1), captured: null });
          r1 += dr;
          c1 += dc;
        }
      }
    }
    return out;
  }
  for (const dr of dirsFor(p)) {
    for (const dc of [-1, 1]) {
      const r1 = r + dr;
      const c1 = c + dc;
      if (inBounds(r1, c1) && board[idx(r1, c1)] === null) {
        out.push({ from: i, to: idx(r1, c1), captured: null });
      }
    }
  }
  return out;
}

/**
 * Legal moves for a seat. Задължително вземане със СВОБОДЕН избор: ако има
 * вземане, законни са само вземанията (която и да е поредица, не непременно
 * най-дългата). В поредица (chainFrom) — само продълженията на този пул.
 */
function legalMovesForSeat(
  board: Piece[],
  seat: Seat,
  chainFrom: number | null,
  pending: readonly number[] = [],
): Move[] {
  if (chainFrom !== null) return capturesFrom(board, chainFrom, seat, pending);
  const captures: Move[] = [];
  const all: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (owner(board[i]) !== seat) continue;
    captures.push(...capturesFrom(board, i, seat));
    all.push(...stepsFrom(board, i, seat));
  }
  return captures.length > 0 ? captures : all;
}

interface Applied {
  board: Piece[];
  /** Взетите пулове, които още чакат махане (празно, ако ходът е свършил). */
  pending: number[];
  /** Ходът свършва тук (няма продължение на веригата). */
  ends: boolean;
}

/**
 * Прилага един скок/ход върху копие — ЕДИНСТВЕНОТО място с логиката, ползвано
 * от reduce, генерирането на вземания и бота. Пул, стъпил на последния ред,
 * става дама ВЕДНАГА (руско правило — и по време на вземане), а продължението
 * се търси вече като дама. Взетият пул влиза в `pending` и остава на дъската;
 * ако поредицата свършва, всички чакащи се махат наведнъж.
 */
function applied(board: Piece[], pending: readonly number[], move: Move, seat: Seat): Applied {
  const b = board.slice();
  const p = b[move.from]!;
  b[move.from] = null;
  b[move.to] = p;
  crown(b, move.to, p);
  if (move.captured === null) return { board: b, pending: [], ends: true };
  const next = [...pending, move.captured];
  if (rawCapturesFrom(b, move.to, seat, next).length > 0) return { board: b, pending: next, ends: false };
  for (const cell of next) b[cell] = null; // край на поредицата — махаме всички взети
  return { board: b, pending: [], ends: true };
}

/** Превръщане в дама, щом пулът стъпи на последния ред. */
function crown(b: Piece[], at: number, p: Piece): Piece[] {
  const [tr] = rc(at);
  if (p === "w" && tr === 0) b[at] = "W";
  else if (p === "b" && tr === 7) b[at] = "B";
  return b;
}

/** Longest capture chain continuing from a square (взетите в `pending` не се броят повторно). */
function chainDepth(board: Piece[], pending: readonly number[], from: number, seat: Seat): number {
  let best = 0;
  for (const c of capturesFrom(board, from, seat, pending)) {
    const r = applied(board, pending, c, seat);
    const d = 1 + (r.ends ? 0 : chainDepth(r.board, r.pending, c.to, seat));
    if (d > best) best = d;
  }
  return best;
}

export const draughtsEngine: GameEngine<DraughtsState, DraughtsAction, DraughtsEvent> = {
  init(_opts: InitOpts): DraughtsState {
    const board = startBoard();
    return {
      board,
      turn: 0,
      chainFrom: null,
      winner: null,
      done: false,
      noCaptureMoves: 0,
      pending: [],
      positions: [positionKey(board, 0)],
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    return legalMovesForSeat(state.board, seat, state.chainFrom, state.pending ?? []).map((m) => ({
      type: "MOVE" as const,
      from: m.from,
      to: m.to,
    }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "MOVE") throw new IllegalActionError("Only MOVE");
    const seat = state.turn;
    const pending = state.pending ?? [];
    const legal = legalMovesForSeat(state.board, seat, state.chainFrom, pending);
    const move = legal.find((m) => m.from === action.from && m.to === action.to);
    if (!move) throw new IllegalActionError(`Illegal move ${action.from}->${action.to}`);

    const events: DraughtsEvent[] = [];
    const piece = state.board[move.from]!;
    // Руско правило: пул, стъпил на последния ред, става дама веднага (и в
    // поредица — продължава като дама). Взетите стоят до края на поредицата.
    const r = applied(state.board, pending, move, seat);
    const board = r.board;
    events.push({ type: "MOVE", seat, from: move.from, to: move.to, captured: move.captured });

    const crowned = !isKing(piece) && isKing(board[move.to]);
    if (crowned) events.push({ type: "KING", seat, at: move.to });
    if (!r.ends) {
      // Same player keeps the turn to continue capturing; no win/draw check
      // mid-chain (board not yet handed over).
      return {
        state: { ...state, board, chainFrom: move.to, pending: r.pending, noCaptureMoves: 0 },
        events,
      };
    }
    // Броячът за реми: само ходове с дамка без вземане; вземане или ход на
    // обикновен пул го нулират (и правят позицията необратима за повторението).
    const irreversible = move.captured !== null || !isKing(piece);
    const noCaptureMoves = irreversible ? 0 : state.noCaptureMoves + 1;
    const turn: Seat = seat === 0 ? 1 : 0;
    const key = positionKey(board, turn);
    const positions = irreversible ? [key] : [...(state.positions ?? []), key];
    const next: DraughtsState = {
      ...state,
      board,
      turn,
      chainFrom: null,
      pending: [],
      noCaptureMoves,
      positions,
    };

    // Win if opponent has no pieces or no legal moves.
    const oppMoves = legalMovesForSeat(board, next.turn, null);
    const oppHasPiece = board.some((p) => owner(p) === next.turn);
    if (!oppHasPiece || oppMoves.length === 0) {
      events.push({ type: "WIN", seat });
      return { state: { ...next, winner: seat, done: true }, events };
    }
    // Реми: 15 хода на страна само с дами, или трикратно повторение.
    const repeats = positions.filter((k) => k === key).length;
    if (noCaptureMoves >= KING_ONLY_DRAW_PLIES || repeats >= 3) {
      events.push({ type: "DRAW" });
      return { state: { ...next, winner: null, done: true }, events };
    }
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    if (state.winner === null) {
      return [
        { seat: 0, result: "draw" },
        { seat: 1, result: "draw" },
      ];
    }
    const winner = state.winner;
    const loser: Seat = winner === 0 ? 1 : 0;
    return [
      { seat: winner, result: "win", points: 1 },
      { seat: loser, result: "loss", points: 0 },
    ];
  },

  /** Greedy heuristic (правилата дават свободен избор — ботът сам предпочита
   *  по-дългата поредица), avoid landing under fire, crown. */
  bot(state, seat, rng: SeededRng) {
    if (state.done || state.turn !== seat) return null;
    const pending = state.pending ?? [];
    const moves = legalMovesForSeat(state.board, seat, state.chainFrom, pending);
    if (moves.length === 0) return null;
    const opp: Seat = seat === 0 ? 1 : 0;
    let best: Move[] = [];
    let bestScore = -Infinity;
    for (const mv of moves) {
      const r = applied(state.board, pending, mv, seat);
      const after = r.board;
      let score = 0;
      if (mv.captured !== null) {
        score += 12 * (1 + (r.ends ? 0 : chainDepth(after, r.pending, mv.to, seat)));
      }
      if (!isKing(state.board[mv.from]) && isKing(after[mv.to])) score += 6; // crowning
      if (r.ends) {
        // Turn would pass — how much can the opponent take back?
        let threat = 0;
        for (let i = 0; i < 64; i++) {
          if (owner(after[i]) !== opp) continue;
          const d = chainDepth(after, [], i, opp);
          if (d > threat) threat = d;
        }
        score -= 10 * threat;
      }
      if (!isKing(state.board[mv.from])) {
        const [fr] = rc(mv.from);
        const [tr] = rc(mv.to);
        score += (seat === 0 ? fr - tr : tr - fr) * 0.5; // mild advance bias
      }
      if (score > bestScore) {
        bestScore = score;
        best = [mv];
      } else if (score === bestScore) {
        best.push(mv);
      }
    }
    const pick = best[rng.int(best.length)] ?? moves[0]!;
    return { type: "MOVE", from: pick.from, to: pick.to };
  },

  redact: (s) => s, // open information
};
