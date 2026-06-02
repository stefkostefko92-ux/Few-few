import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";

type Piece = "w" | "W" | "b" | "B" | null;
interface DraughtsState {
  board: Piece[];
  turn: number;
}
type DraughtsAction = { type: "MOVE"; from: number; to: number };

export function DraughtsView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<DraughtsState, DraughtsAction>("DRAUGHTS");
  const { state, legal, seat, phase, result, players } = m;
  const [from, setFrom] = useState<number | null>(null);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const movable = useMemo(() => new Set(legal.map((a) => a.from)), [legal]);
  const targets = useMemo(
    () => (from === null ? [] : legal.filter((a) => a.from === from).map((a) => a.to)),
    [legal, from],
  );

  // Seat 0 = white (bottom). Flip the board for black so "my" pieces are near me.
  const flip = seat === 1;
  const cells = useMemo(() => {
    const idx = Array.from({ length: 64 }, (_, i) => i);
    return flip ? idx.reverse() : idx;
  }, [flip]);

  function onCell(i: number) {
    if (!myTurn || !state) return;
    if (from !== null && targets.includes(i)) {
      const action = legal.find((a) => a.from === from && a.to === i);
      if (action) {
        playCue("flip");
        m.send(action);
      }
      setFrom(null);
      return;
    }
    setFrom(movable.has(i) ? i : null);
  }

  const oppName = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <ScorePill label={oppName} value="" />
          <BoardFrame>
            <div className="aso-grid8" style={{ width: "min(76vw, 480px)" }}>
              {cells.map((i) => {
                const r = Math.floor(i / 8);
                const c = i % 8;
                const dark = (r + c) % 2 === 1;
                const piece = state.board[i];
                const isFrom = from === i;
                const isTarget = targets.includes(i);
                const mine = piece && (seat === 0 ? piece === "w" || piece === "W" : piece === "b" || piece === "B");
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onCell(i)}
                    aria-label={`клетка ${i}`}
                    className={cn(
                      "aso-cell",
                      dark ? "aso-cell--dark" : "aso-cell--light",
                      isFrom && "aso-cell--from",
                      isTarget && "aso-cell--target",
                      myTurn && mine && "cursor-pointer",
                    )}
                  >
                    {piece ? (
                      <span
                        className={cn(
                          "aso-piece",
                          piece === "w" || piece === "W" ? "aso-piece--w" : "aso-piece--b",
                          (piece === "W" || piece === "B") && "aso-piece--king",
                        )}
                        style={{ position: "relative" }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </BoardFrame>
          <ScorePill label={user?.displayName ?? t("game.you")} value={myTurn ? t("game.yourTurn") : ""} highlight={myTurn} />
        </div>
      ) : null}
    </Scene>
  );
}
