/** Minimal client-side mirror of the chess engine's wire types (server is authority). */
export interface ChessAction {
  type: "MOVE";
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
}

export type Orientation = "white" | "black";

export interface Cell {
  square: string; // e.g. "e4"
  piece: string | null; // e.g. "wK", "bP"
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Parse the placement field of a FEN into 8 ranks (rank 8 first) of cells. */
export function parseFen(fen: string): Cell[][] {
  const placement = fen.split(" ")[0] ?? "";
  const ranks = placement.split("/");
  const board: Cell[][] = [];
  for (let r = 0; r < 8; r++) {
    const rankStr = ranks[r] ?? "";
    const rankNumber = 8 - r;
    const row: Cell[] = [];
    let file = 0;
    for (const ch of rankStr) {
      if (/\d/.test(ch)) {
        const empty = Number(ch);
        for (let k = 0; k < empty; k++) {
          row.push({ square: `${FILES[file]}${rankNumber}`, piece: null });
          file++;
        }
      } else {
        const color = ch === ch.toUpperCase() ? "w" : "b";
        const piece = `${color}${ch.toUpperCase()}`;
        row.push({ square: `${FILES[file]}${rankNumber}`, piece });
        file++;
      }
    }
    board.push(row);
  }
  return board;
}
