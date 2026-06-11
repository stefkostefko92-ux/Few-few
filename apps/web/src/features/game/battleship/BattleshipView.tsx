import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import "./battleship.css";

interface BattleshipState {
  ships: number[][]; // only my own fleet is populated (redacted)
  shots: number[][];
  hits: number[][];
  turn: number;
}
type BattleshipAction = { type: "FIRE"; cell: number };

const SIZE = 10;

export function BattleshipView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BattleshipState, BattleshipAction>("BATTLESHIP");
  const { state, legal, seat, phase, result, players } = m;
  const opp = seat === 0 ? 1 : 0;

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const fireable = useMemo(() => new Set(legal.map((a) => a.cell)), [legal]);

  const myShots = state?.shots[seat] ?? [];
  const myHits = new Set(state?.hits[seat] ?? []);
  const oppShots = new Set(state?.shots[opp] ?? []);
  const oppHits = new Set(state?.hits[opp] ?? []);
  const myShips = new Set(state?.ships[seat] ?? []);

  function fire(cell: number) {
    if (!myTurn || !fireable.has(cell)) return;
    playCue(myHits.has(cell) ? "win" : "flip");
    m.send({ type: "FIRE", cell });
  }

  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-start lg:justify-center">
          {/* Firing grid (opponent waters). */}
          <div className="flex flex-col items-center gap-2">
            <ScorePill label={t("battleship.enemy", { name: oppName })} value="" highlight={myTurn} />
            <BoardFrame>
              <div className="bs-grid">
                {Array.from({ length: SIZE * SIZE }).map((_, cell) => {
                  const shot = myShots.includes(cell);
                  const hit = myHits.has(cell);
                  return (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => fire(cell)}
                      className={cn(
                        "bs-cell",
                        !shot && myTurn && fireable.has(cell) && "bs-cell--fireable",
                        shot && (hit ? "bs-cell--hit" : "bs-cell--miss"),
                      )}
                    >
                      {shot ? (hit ? "✸" : "•") : ""}
                    </button>
                  );
                })}
              </div>
            </BoardFrame>
          </div>

          {/* My fleet. */}
          <div className="flex flex-col items-center gap-2">
            <ScorePill label={user?.displayName ?? t("game.you")} value={t("battleship.yourFleet")} />
            <BoardFrame>
              <div className="bs-grid bs-grid--mine">
                {Array.from({ length: SIZE * SIZE }).map((_, cell) => {
                  const ship = myShips.has(cell);
                  const shot = oppShots.has(cell);
                  const hit = oppHits.has(cell);
                  return (
                    <span
                      key={cell}
                      className={cn(
                        "bs-cell",
                        ship && "bs-cell--ship",
                        shot && (hit ? "bs-cell--hit" : "bs-cell--miss"),
                      )}
                    >
                      {shot ? (hit ? "✸" : "•") : ""}
                    </span>
                  );
                })}
              </div>
            </BoardFrame>
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
