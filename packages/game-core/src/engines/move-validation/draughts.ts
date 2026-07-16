import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Дама / Draughts — 2p abstract on 8x8 dark squares (§4.9). Bulgarian /
 * international-style rules:
 *   - Men move diagonally forward 1, but CAPTURE both forward and backward.
 *   - Kings are "flying": they slide any number of empty squares along a
 *     diagonal, capture a distant piece over empty squares, and may land on any
 *     empty square behind it.
 *   - Captures are mandatory when available, and a capture must be CHAINED —
 *     if the same piece can capture again it must continue, until no further
 *     capture exists (then the turn passes).
 *   - A man that lands on the crowning row MID-CHAIN keeps capturing as a man
 *     (international rule); it is crowned only when its move ENDS there.
 *   - 80 quiet plies (no capture) end the game: material advantage wins
 *     (king = 2), equal material is a draw.
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
  noCaptureMoves: number; // for draw-ish stalemate cap
}

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

/** Capture jumps available from a single square (men: both directions; kings: flying). */
function capturesFrom(board: Piece[], i: number, seat: Seat): Move[] {
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
        let r2 = r1 + dr;
        let c2 = c1 + dc;
        while (inBounds(r2, c2) && board[idx(r2, c2)] === null) {
          out.push({ from: i, to: idx(r2, c2), captured: mid });
          r2 += dr;
          c2 += dc;
        }
      } else {
        // Men capture adjacent enemies forward AND backward (Bulgarian rules).
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (!inBounds(lr, lc)) continue;
        const mid = idx(r + dr, c + dc);
        const midOwner = owner(board[mid]);
        if (midOwner !== null && midOwner !== seat && board[idx(lr, lc)] === null) {
          out.push({ from: i, to: idx(lr, lc), captured: mid });
        }
      }
    }
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

/** Total pieces removed by the maximal chain that STARTS with capture `m`. */
function captureChainLen(board: Piece[], m: Move, seat: Seat): number {
  return 1 + chainDepth(applied(board, m, seat), m.to, seat);
}

/** Keep only the captures that begin a MAXIMUM-length chain (the majority /
 *  maximum-capture rule required by international/Bulgarian draughts). */
function maximalCaptures(board: Piece[], captures: Move[], seat: Seat): Move[] {
  if (captures.length <= 1) return captures;
  const lens = captures.map((c) => captureChainLen(board, c, seat));
  const max = Math.max(...lens);
  return captures.filter((_, i) => lens[i] === max);
}

/**
 * Legal moves for a seat. Mandatory capture: if any capture exists, only
 * captures are legal — AND the player must take a chain that removes the most
 * pieces (maximum-capture rule). Mid-chain (chainFrom set) restricts to that
 * piece's maximal continuation captures.
 */
function legalMovesForSeat(board: Piece[], seat: Seat, chainFrom: number | null): Move[] {
  if (chainFrom !== null) return maximalCaptures(board, capturesFrom(board, chainFrom, seat), seat);
  const captures: Move[] = [];
  const all: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (owner(board[i]) !== seat) continue;
    captures.push(...capturesFrom(board, i, seat));
    all.push(...stepsFrom(board, i, seat));
  }
  return captures.length > 0 ? maximalCaptures(board, captures, seat) : all;
}

/** Apply a move to a board copy, mirroring reduce's crowning rule (bot/eval helper). */
function applied(board: Piece[], move: Move, seat: Seat): Piece[] {
  const b = board.slice();
  const p = b[move.from]!;
  b[move.from] = null;
  b[move.to] = p;
  if (move.captured !== null) b[move.captured] = null;
  const [tr] = rc(move.to);
  const endsHere = move.captured === null || capturesFrom(b, move.to, seat).length === 0;
  if (endsHere) {
    if (p === "w" && tr === 0) b[move.to] = "W";
    else if (p === "b" && tr === 7) b[move.to] = "B";
  }
  return b;
}

/** Greedy longest capture chain starting from a square (bot heuristic). */
function chainDepth(board: Piece[], from: number, seat: Seat): number {
  let best = 0;
  for (const c of capturesFrom(board, from, seat)) {
    const d = 1 + chainDepth(applied(board, c, seat), c.to, seat);
    if (d > best) best = d;
  }
  return best;
}

export const draughtsEngine: GameEngine<DraughtsState, DraughtsAction, DraughtsEvent> = {
  init(_opts: InitOpts): DraughtsState {
    return { board: startBoard(), turn: 0, chainFrom: null, winner: null, done: false, noCaptureMoves: 0 };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    return legalMovesForSeat(state.board, seat, state.chainFrom).map((m) => ({
      type: "MOVE" as const,
      from: m.from,
      to: m.to,
    }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    if (action.type !== "MOVE") throw new IllegalActionError("Only MOVE");
    const seat = state.turn;
    const legal = legalMovesForSeat(state.board, seat, state.chainFrom);
    const move = legal.find((m) => m.from === action.from && m.to === action.to);
    if (!move) throw new IllegalActionError(`Illegal move ${action.from}->${action.to}`);

    const board = state.board.slice();
    const events: DraughtsEvent[] = [];
    const piece = board[move.from]!;
    board[move.from] = null;
    board[move.to] = piece;
    if (move.captured !== null) board[move.captured] = null;
    events.push({ type: "MOVE", seat, from: move.from, to: move.to, captured: move.captured });

    // Chain first: a man passing through the crowning row mid-capture keeps
    // capturing as a man (international rule) — it crowns only when the move
    // ENDS there.
    let chainFrom: number | null = null;
    if (move.captured !== null && capturesFrom(board, move.to, seat).length > 0) {
      chainFrom = move.to;
    }

    // Promotion (only when the move ends here).
    const [tr] = rc(move.to);
    if (chainFrom === null) {
      if (piece === "w" && tr === 0) {
        board[move.to] = "W";
        events.push({ type: "KING", seat, at: move.to });
      } else if (piece === "b" && tr === 7) {
        board[move.to] = "B";
        events.push({ type: "KING", seat, at: move.to });
      }
    }

    if (chainFrom !== null) {
      // Same player keeps the turn to continue capturing; no win/stalemate check
      // mid-chain (board not yet handed over).
      return { state: { ...state, board, chainFrom, noCaptureMoves: 0 }, events };
    }

    const noCaptureMoves = move.captured === null ? state.noCaptureMoves + 1 : 0;
    const next: DraughtsState = {
      ...state,
      board,
      turn: seat === 0 ? 1 : 0,
      chainFrom: null,
      noCaptureMoves,
    };

    // Win if opponent has no pieces or no legal moves.
    const oppMoves = legalMovesForSeat(board, next.turn, null);
    const oppHasPiece = board.some((p) => owner(p) === next.turn);
    if (!oppHasPiece || oppMoves.length === 0) {
      events.push({ type: "WIN", seat });
      return { state: { ...next, winner: seat, done: true }, events };
    }
    if (noCaptureMoves >= 80) {
      // Quiet-game cap: material advantage wins, equal material is a draw.
      const m0 = pieceCount(board, 0);
      const m1 = pieceCount(board, 1);
      if (m0 === m1) {
        events.push({ type: "DRAW" });
        return { state: { ...next, winner: null, done: true }, events };
      }
      const winner: Seat = m0 > m1 ? 0 : 1;
      events.push({ type: "WIN", seat: winner });
      return { state: { ...next, winner, done: true }, events };
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

  /** Greedy heuristic: longest capture chain, avoid landing under fire, crown. */
  bot(state, seat, rng: SeededRng) {
    if (state.done || state.turn !== seat) return null;
    const moves = legalMovesForSeat(state.board, seat, state.chainFrom);
    if (moves.length === 0) return null;
    const opp: Seat = seat === 0 ? 1 : 0;
    let best: Move[] = [];
    let bestScore = -Infinity;
    for (const mv of moves) {
      const after = applied(state.board, mv, seat);
      let score = 0;
      if (mv.captured !== null) score += 12 * (1 + chainDepth(after, mv.to, seat));
      if (!isKing(state.board[mv.from]) && isKing(after[mv.to])) score += 6; // crowning
      const chains = mv.captured !== null && capturesFrom(after, mv.to, seat).length > 0;
      if (!chains) {
        // Turn would pass — how much can the opponent take back?
        let threat = 0;
        for (let i = 0; i < 64; i++) {
          if (owner(after[i]) !== opp) continue;
          const d = chainDepth(after, i, opp);
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

function pieceCount(board: Piece[], seat: Seat): number {
  let n = 0;
  for (const p of board) if (owner(p) === seat) n += isKing(p) ? 2 : 1;
  return n;
}
