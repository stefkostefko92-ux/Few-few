import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";

/**
 * Дама / Draughts — 2p abstract on 8x8 dark squares (§4.9). International-style
 * basics: men move diagonally forward 1; capture by jumping an adjacent
 * opponent into an empty square (forward or backward); reaching the far row
 * promotes to a king (moves/captures both directions). Captures are mandatory
 * when available. No multi-jump chaining for now (documented simplification,
 * S9) — a capture is a single jump; the turn then passes.
 *
 * Board: 64 cells indexed 0..63 (row*8+col). Seat 0 = white (moves up, toward
 * row 0), seat 1 = black (moves down). Only dark squares hold pieces.
 */

type Piece = "w" | "W" | "b" | "B" | null; // upper = king

export interface DraughtsState {
  board: Piece[];
  turn: Seat;
  winner: Seat | null;
  done: boolean;
  noCaptureMoves: number; // for draw-ish stalemate cap
}

export type DraughtsAction = { type: "MOVE"; from: number; to: number };
export type DraughtsEvent =
  | { type: "MOVE"; seat: Seat; from: number; to: number; captured: number | null }
  | { type: "KING"; seat: Seat; at: number }
  | { type: "WIN"; seat: Seat };

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

/** Forward row directions for a seat's men; kings use both. */
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

/** Collect all legal moves for a seat, enforcing mandatory capture. */
function legalMovesForSeat(board: Piece[], seat: Seat): Move[] {
  const all: Move[] = [];
  const captures: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (owner(board[i]) !== seat) continue;
    const p = board[i];
    const [r, c] = rc(i);
    for (const dr of dirsFor(p)) {
      for (const dc of [-1, 1]) {
        const r1 = r + dr;
        const c1 = c + dc;
        if (inBounds(r1, c1) && board[idx(r1, c1)] === null) {
          all.push({ from: i, to: idx(r1, c1), captured: null });
        }
        const r2 = r + 2 * dr;
        const c2 = c + 2 * dc;
        if (inBounds(r2, c2)) {
          const mid = idx(r1, c1);
          const land = idx(r2, c2);
          const midOwner = owner(board[mid]);
          if (midOwner !== null && midOwner !== seat && board[land] === null) {
            captures.push({ from: i, to: land, captured: mid });
          }
        }
      }
    }
  }
  return captures.length > 0 ? captures : all;
}

export const draughtsEngine: GameEngine<DraughtsState, DraughtsAction, DraughtsEvent> = {
  init(_opts: InitOpts): DraughtsState {
    return { board: startBoard(), turn: 0, winner: null, done: false, noCaptureMoves: 0 };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    return legalMovesForSeat(state.board, seat).map((m) => ({
      type: "MOVE" as const,
      from: m.from,
      to: m.to,
    }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "MOVE") throw new IllegalActionError("Only MOVE");
    const seat = state.turn;
    const legal = legalMovesForSeat(state.board, seat);
    const move = legal.find((m) => m.from === action.from && m.to === action.to);
    if (!move) throw new IllegalActionError(`Illegal move ${action.from}->${action.to}`);

    const board = state.board.slice();
    const events: DraughtsEvent[] = [];
    const piece = board[move.from]!;
    board[move.from] = null;
    board[move.to] = piece;
    if (move.captured !== null) board[move.captured] = null;
    events.push({ type: "MOVE", seat, from: move.from, to: move.to, captured: move.captured });

    // Promotion.
    const [tr] = rc(move.to);
    if (piece === "w" && tr === 0) {
      board[move.to] = "W";
      events.push({ type: "KING", seat, at: move.to });
    } else if (piece === "b" && tr === 7) {
      board[move.to] = "B";
      events.push({ type: "KING", seat, at: move.to });
    }

    const noCaptureMoves = move.captured === null ? state.noCaptureMoves + 1 : 0;
    const next: DraughtsState = { ...state, board, turn: seat === 0 ? 1 : 0, noCaptureMoves };

    // Win if opponent has no pieces or no legal moves.
    const oppMoves = legalMovesForSeat(board, next.turn);
    const oppHasPiece = board.some((p) => owner(p) === next.turn);
    if (!oppHasPiece || oppMoves.length === 0) {
      events.push({ type: "WIN", seat });
      return { state: { ...next, winner: seat, done: true }, events };
    }
    if (noCaptureMoves >= 80) {
      // Stalemate cap -> more material wins.
      const winner = pieceCount(board, 0) >= pieceCount(board, 1) ? 0 : 1;
      events.push({ type: "WIN", seat: winner });
      return { state: { ...next, winner, done: true }, events };
    }
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

  redact: (s) => s, // open information
};

function pieceCount(board: Piece[], seat: Seat): number {
  let n = 0;
  for (const p of board) if (owner(p) === seat) n += isKing(p) ? 2 : 1;
  return n;
}
