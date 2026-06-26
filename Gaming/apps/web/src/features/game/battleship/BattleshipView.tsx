import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
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

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "FIRE" && ev.hit) return ev.seat === seat ? { text: t("fx.fireHit"), tone: "win" } : { text: t("fx.fireHitYou"), tone: "loss" };
      return null;
    },
  });
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
      <Announcements banners={banners} fixed />
      {state ? (
        <FeltTable crest="⚓" feltColor="#1c4a6e" feltDark="#0a2238">
        <div className="flex h-full flex-col items-center justify-center gap-5 p-6 lg:flex-row lg:justify-center">
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
        </FeltTable>
      ) : null}
    </Scene>
  );
}
