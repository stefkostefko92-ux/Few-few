import { Chess, type Square } from "chess.js";
import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Chess via chess.js (move-validation pattern, §7.2). No hidden info and no RNG,
 * so `redact` is a no-op. Seat 0 = White, seat 1 = Black.
 *
 * State is the FEN plus the bookkeeping chess.js loses when rebuilt from a FEN:
 * a repetition counter (threefold-repetition draws — the map is pruned on every
 * irreversible move, so it stays tiny), a pending draw offer, and resignation /
 * agreed-draw flags. RESIGN and DRAW_OFFER/DRAW_ACCEPT are engine actions
 * offered only to the side to move (the room's turn model requires exactly one
 * seat with legal actions); an offer stands until the opponent accepts or moves.
 */

export type ChessDrawReason = "stalemate" | "fifty" | "material" | "threefold" | "agreement";

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
  /** Occurrences of each position (trimmed FEN) since the last irreversible move. */
  reps: Record<string, number>;
  /** Seat with an outstanding draw offer (cleared when the offeree moves). */
  drawOffer: Seat | null;
  /** Set when a seat resigns — that seat loses. */
  resigned: Seat | null;
  /** Set when the game ends drawn by agreement or threefold repetition. */
  drawn: "agreement" | "threefold" | null;
}

export interface ChessMoveAction {
  type: "MOVE";
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export type ChessAction =
  | ChessMoveAction
  | { type: "RESIGN" }
  | { type: "DRAW_OFFER" }
  | { type: "DRAW_ACCEPT" };

export type ChessEvent =
  | { type: "MOVE"; seat: Seat; san: string; from: string; to: string }
  | { type: "CHECK"; seat: Seat }
  | { type: "CHECKMATE"; seat: Seat }
  | { type: "DRAW"; reason: ChessDrawReason }
  | { type: "RESIGN"; seat: Seat }
  | { type: "DRAW_OFFER"; seat: Seat };

const seatToTurn = (seat: Seat): "w" | "b" => (seat === 0 ? "w" : "b");
const turnToSeat = (turn: "w" | "b"): Seat => (turn === "w" ? 0 : 1);

/** Position key for repetition counting: FEN minus the move clocks. */
const trimFen = (fen: string): string => fen.split(" ").slice(0, 4).join(" ");

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const chessEngine: GameEngine<ChessState, ChessAction, ChessEvent> = {
  init(_opts: InitOpts): ChessState {
    const fen = new Chess().fen();
    return {
      fen,
      lastMove: null,
      reps: { [trimFen(fen)]: 1 },
      drawOffer: null,
      resigned: null,
      drawn: null,
    };
  },

  legalActions(state, seat) {
    if ((state.resigned ?? null) !== null || (state.drawn ?? null) !== null) return [];
    const chess = new Chess(state.fen);
    if (chess.isGameOver()) return [];
    if (turnToSeat(chess.turn()) !== seat) return [];
    const actions: ChessAction[] = chess.moves({ verbose: true }).map((m) => {
      const action: ChessMoveAction = { type: "MOVE", from: m.from, to: m.to };
      if (m.promotion) action.promotion = m.promotion as "q" | "r" | "b" | "n";
      return action;
    });
    actions.push({ type: "RESIGN" });
    const offer = state.drawOffer ?? null;
    if (offer !== null && offer !== seat) actions.push({ type: "DRAW_ACCEPT" });
    else if (offer === null) actions.push({ type: "DRAW_OFFER" });
    return actions;
  },

  reduce(state, action) {
    if (chessEngine.isTerminal(state)) throw new IllegalActionError("Game over");
    const chess = new Chess(state.fen);
    const mover = turnToSeat(chess.turn());

    if (action.type === "RESIGN") {
      return {
        state: { ...state, resigned: mover },
        events: [{ type: "RESIGN", seat: mover }],
      };
    }
    if (action.type === "DRAW_OFFER") {
      if ((state.drawOffer ?? null) !== null) throw new IllegalActionError("Draw already offered");
      return {
        state: { ...state, drawOffer: mover },
        events: [{ type: "DRAW_OFFER", seat: mover }],
      };
    }
    if (action.type === "DRAW_ACCEPT") {
      const offer = state.drawOffer ?? null;
      if (offer === null || offer === mover) throw new IllegalActionError("No draw offer to accept");
      return {
        state: { ...state, drawOffer: null, drawn: "agreement" as const },
        events: [{ type: "DRAW", reason: "agreement" }],
      };
    }
    if (action.type !== "MOVE") throw new IllegalActionError("Unknown action");

    let move;
    try {
      move = chess.move({
        from: action.from as Square,
        to: action.to as Square,
        ...(action.promotion ? { promotion: action.promotion } : {}),
      });
    } catch {
      throw new IllegalActionError(`Illegal move ${action.from}${action.to}`);
    }

    // Repetition bookkeeping: an irreversible move (pawn push / capture) makes
    // every earlier position unreachable, so the counter map restarts.
    const key = trimFen(chess.fen());
    const irreversible = move.piece === "p" || move.captured !== undefined;
    const reps: Record<string, number> = irreversible ? {} : { ...(state.reps ?? {}) };
    reps[key] = (reps[key] ?? 0) + 1;
    const threefold = reps[key]! >= 3;

    const events: ChessEvent[] = [
      { type: "MOVE", seat: mover, san: move.san, from: move.from, to: move.to },
    ];
    if (chess.isCheckmate()) {
      events.push({ type: "CHECKMATE", seat: mover });
    } else if (threefold) {
      events.push({ type: "DRAW", reason: "threefold" });
    } else if (chess.isStalemate()) {
      events.push({ type: "DRAW", reason: "stalemate" });
    } else if (chess.isInsufficientMaterial()) {
      events.push({ type: "DRAW", reason: "material" });
    } else if (chess.isDraw()) {
      events.push({ type: "DRAW", reason: "fifty" });
    } else if (chess.isCheck()) {
      events.push({ type: "CHECK", seat: turnToSeat(chess.turn()) });
    }

    return {
      state: {
        ...state,
        fen: chess.fen(),
        lastMove: { from: move.from, to: move.to },
        reps,
        // The offeree moving declines the offer; the offerer's own stands until
        // the opponent responds (offer → move → opponent accepts or moves).
        drawOffer: (state.drawOffer ?? null) === mover ? mover : null,
        drawn: threefold ? ("threefold" as const) : null,
      },
      events,
    };
  },

  isTerminal(state) {
    if ((state.resigned ?? null) !== null || (state.drawn ?? null) !== null) return true;
    return new Chess(state.fen).isGameOver();
  },

  score(state): SeatScore[] {
    const resigned = state.resigned ?? null;
    if (resigned !== null) {
      const winner: Seat = resigned === 0 ? 1 : 0;
      return [
        { seat: winner, result: "win", points: 1 },
        { seat: resigned, result: "loss", points: 0 },
      ];
    }
    const chess = new Chess(state.fen);
    if (chess.isCheckmate()) {
      // The side to move has been mated — they lose.
      const loser = turnToSeat(chess.turn());
      const winner: Seat = loser === 0 ? 1 : 0;
      return [
        { seat: winner, result: "win", points: 1 },
        { seat: loser, result: "loss", points: 0 },
      ];
    }
    return [
      { seat: 0, result: "draw" },
      { seat: 1, result: "draw" },
    ];
  },

  /**
   * Cheap material-greedy policy (also keeps bot substitutes from ever picking
   * RESIGN/DRAW actions at random): mate-in-1, else maximize captured material
   * minus the opponent's best immediate recapture.
   */
  bot(state, seat, rng: SeededRng) {
    if (chessEngine.isTerminal(state)) return null;
    const chess = new Chess(state.fen);
    if (turnToSeat(chess.turn()) !== seat) return null;
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;
    let best: typeof moves = [];
    let bestScore = -Infinity;
    for (const m of moves) {
      chess.move(m.san);
      let score = m.captured ? (PIECE_VALUE[m.captured] ?? 0) : 0;
      if (m.promotion) score += (PIECE_VALUE[m.promotion] ?? 0) - 1;
      if (chess.isCheckmate()) {
        score += 1000;
      } else {
        let oppBest = 0;
        for (const reply of chess.moves({ verbose: true })) {
          const v = reply.captured ? (PIECE_VALUE[reply.captured] ?? 0) : 0;
          if (v > oppBest) oppBest = v;
        }
        score -= oppBest;
      }
      chess.undo();
      if (score > bestScore) {
        bestScore = score;
        best = [m];
      } else if (score === bestScore) {
        best.push(m);
      }
    }
    const pick = best[rng.int(best.length)] ?? moves[0]!;
    const action: ChessMoveAction = { type: "MOVE", from: pick.from, to: pick.to };
    if (pick.promotion) action.promotion = pick.promotion as "q" | "r" | "b" | "n";
    return action;
  },

  // No hidden information in chess.
  redact(state) {
    return state;
  },
};

export { seatToTurn };
