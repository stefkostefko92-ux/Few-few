import { useMemo, useState } from "react";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { parseFen, type ChessAction, type Orientation } from "./types";

const GLYPH: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

interface Props {
  fen: string;
  legalActions: ChessAction[];
  myTurn: boolean;
  orientation: Orientation;
  lastMove: { from: string; to: string } | null;
  onMove: (action: ChessAction) => void;
  /** Player clicked an illegal destination for the selected piece. */
  onIllegal?: () => void;
}

export function ChessBoard({ fen, legalActions, myTurn, orientation, lastMove, onMove, onIllegal }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const board = parseFen(fen);
    return orientation === "white" ? board : [...board].reverse().map((r) => [...r].reverse());
  }, [fen, orientation]);

  const movableFrom = useMemo(() => new Set(legalActions.map((a) => a.from)), [legalActions]);
  const targets = useMemo(
    () => (selected ? legalActions.filter((a) => a.from === selected).map((a) => a.to) : []),
    [legalActions, selected],
  );

  function onCellClick(square: string) {
    if (!myTurn) return;
    if (selected && targets.includes(square)) {
      const options = legalActions.filter((a) => a.from === selected && a.to === square);
      const chosen = options.find((a) => a.promotion === "q") ?? options[0];
      if (chosen) onMove(chosen);
      setSelected(null);
      return;
    }
    if (movableFrom.has(square)) {
      setSelected(square);
      return;
    }
    if (selected) onIllegal?.();
    setSelected(null);
  }

  return (
    <BoardFrame>
      <div className="aso-grid8" style={{ width: "min(90vw, 72vh, 720px)" }}>
        {rows.flat().map((cell) => {
          const fileIdx = cell.square.charCodeAt(0) - 97;
          const rankIdx = Number(cell.square[1]) - 1;
          const dark = (fileIdx + rankIdx) % 2 === 0;
          const isSelected = selected === cell.square;
          const isTarget = targets.includes(cell.square);
          const isLast = lastMove && (lastMove.from === cell.square || lastMove.to === cell.square);
          const white = cell.piece?.startsWith("w");
          return (
            <button
              key={cell.square}
              type="button"
              onClick={() => onCellClick(cell.square)}
              aria-label={cell.square}
              className={cn(
                "aso-cell",
                dark ? "aso-cell--dark" : "aso-cell--light",
                isLast && "aso-cell--last",
                isSelected && "aso-cell--from",
                isTarget && "aso-cell--target",
                myTurn && movableFrom.has(cell.square) && "cursor-pointer",
              )}
            >
              {cell.piece ? (
                <span
                  className="select-none leading-none"
                  style={{
                    fontSize: "clamp(1.6rem, 6vw, 2.6rem)",
                    color: white ? "#fffdf6" : "#15171b",
                    textShadow: white
                      ? "0 2px 3px rgba(0,0,0,.55)"
                      : "0 1px 2px rgba(255,255,255,.2)",
                  }}
                >
                  {GLYPH[cell.piece]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </BoardFrame>
  );
}
