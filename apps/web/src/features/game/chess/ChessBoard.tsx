import { useMemo, useState } from "react";
import { cn } from "../../../ui";
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
}

export function ChessBoard({ fen, legalActions, myTurn, orientation, lastMove, onMove }: Props) {
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
      // Prefer auto-queen when a move has promotion variants.
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
    setSelected(null);
  }

  return (
    <div className="inline-grid grid-cols-8 overflow-hidden rounded-card border-4 border-wood-800 shadow-lift">
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
              "relative flex size-12 items-center justify-center sm:size-16",
              dark ? "bg-felt-900" : "bg-felt-700",
              isLast && "ring-2 ring-inset ring-brass-400/60",
              isSelected && "ring-4 ring-inset ring-brass-300",
              myTurn && movableFrom.has(cell.square) && "cursor-pointer",
            )}
          >
            {cell.piece ? (
              <span
                className={cn(
                  "select-none text-3xl leading-none sm:text-4xl",
                  white ? "text-ink-100" : "text-charcoal-900",
                )}
                style={{
                  textShadow: white ? "0 1px 2px rgba(0,0,0,.6)" : "0 1px 1px rgba(255,255,255,.15)",
                }}
              >
                {GLYPH[cell.piece]}
              </span>
            ) : null}
            {isTarget ? (
              <span className="absolute size-3 rounded-full bg-brass-300/70 sm:size-4" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
