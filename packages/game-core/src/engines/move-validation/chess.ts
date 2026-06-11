import { Chess, type Square } from "chess.js";
import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";

/**
 * Chess via chess.js (move-validation pattern, §7.2). No hidden info and no RNG:
 * state is just the FEN, so it is trivially serializable and `redact` is a no-op.
 * Seat 0 = White, seat 1 = Black.
 */

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
}

export type ChessAction = {
  type: "MOVE";
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
};

export type ChessEvent =
  | { type: "MOVE"; seat: Seat; san: string; from: string; to: string }
  | { type: "CHECK"; seat: Seat }
  | { type: "CHECKMATE"; seat: Seat }
  | { type: "DRAW" };

const seatToTurn = (seat: Seat): "w" | "b" => (seat === 0 ? "w" : "b");
const turnToSeat = (turn: "w" | "b"): Seat => (turn === "w" ? 0 : 1);

export const chessEngine: GameEngine<ChessState, ChessAction, ChessEvent> = {
  init(_opts: InitOpts): ChessState {
    return { fen: new Chess().fen(), lastMove: null };
  },

  legalActions(state, seat) {
    const chess = new Chess(state.fen);
    if (chess.isGameOver()) return [];
    if (turnToSeat(chess.turn()) !== seat) return [];
    return chess.moves({ verbose: true }).map((m) => {
      const action: ChessAction = { type: "MOVE", from: m.from, to: m.to };
      if (m.promotion) action.promotion = m.promotion as ChessAction["promotion"];
      return action;
    });
  },

  reduce(state, action) {
    if (action.type !== "MOVE") throw new IllegalActionError("Unknown action");
    const chess = new Chess(state.fen);
    const mover = turnToSeat(chess.turn());

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

    const events: ChessEvent[] = [
      { type: "MOVE", seat: mover, san: move.san, from: move.from, to: move.to },
    ];
    if (chess.isCheckmate()) {
      events.push({ type: "CHECKMATE", seat: mover });
    } else if (chess.isCheck()) {
      events.push({ type: "CHECK", seat: turnToSeat(chess.turn()) });
    } else if (chess.isDraw() || chess.isStalemate()) {
      events.push({ type: "DRAW" });
    }

    return { state: { fen: chess.fen(), lastMove: { from: move.from, to: move.to } }, events };
  },

  isTerminal(state) {
    return new Chess(state.fen).isGameOver();
  },

  score(state): SeatScore[] {
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

  // No hidden information in chess.
  redact(state) {
    return state;
  },
};

export { seatToTurn };
