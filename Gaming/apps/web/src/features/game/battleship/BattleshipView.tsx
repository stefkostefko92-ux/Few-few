import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameEvents } from "../useGameEvents";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
import "./battleship.css";

interface BattleshipState {
  // ships[seat] = list of ships (cell lists). Mine is full; of the opponent's
  // fleet the server reveals only SUNK ships (redacted).
  ships: number[][][];
  shots: number[][];
  hits: number[][];
  turn: number;
}
type BattleshipAction = { type: "FIRE"; cell: number };

const SIZE = 10;
// БГ convention: columns А–К (Й is skipped), rows 1–10.
const COL_LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

export function BattleshipView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BattleshipState, BattleshipAction>("BATTLESHIP");
  const { state, legal, seat, phase, result, players } = m;

  // Opponent-visible action announcements. The banner tone already plays the
  // win/loss cue — no explicit playCue here (it would double the sound).
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "SUNK") {
        return ev.seat === seat
          ? { text: t("fx.sunk"), tone: "win" }
          : { text: t("fx.sunkYou"), tone: "loss" };
      }
      if (ev.type === "FIRE" && ev.hit) {
        return ev.seat === seat ? { text: t("fx.fireHit"), tone: "win" } : { text: t("fx.fireHitYou"), tone: "loss" };
      }
      return null;
    },
  });
  const opp = seat === 0 ? 1 : 0;

  // The last shot fired — gates the pop animation to that one cell (on the
  // board it landed on), so a resync/remount never replays every old marker.
  const [fresh, setFresh] = useState<{ cell: number; mine: boolean } | null>(null);
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; cell?: number; seat?: number };
      if (ev.type === "FIRE" && typeof ev.cell === "number") {
        setFresh({ cell: ev.cell, mine: ev.seat === seat });
      }
    }
  });

  // One shot in flight at a time: block re-fires until the next state lands.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(false);
  }, [state]);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const fireable = useMemo(() => new Set(legal.map((a) => a.cell)), [legal]);

  const myShots = state?.shots[seat] ?? [];
  const myHits = new Set(state?.hits[seat] ?? []);
  const oppShots = new Set(state?.shots[opp] ?? []);
  const oppHits = new Set(state?.hits[opp] ?? []);
  const myShips = new Set(state?.ships[seat]?.flat() ?? []);
  // Opponent ships in my redacted view are exactly their SUNK ships.
  const oppSunk = new Set(state?.ships[opp]?.flat() ?? []);
  // My own sunk ships: every cell already hit by the opponent.
  const mySunk = new Set(
    (state?.ships[seat] ?? []).filter((ship) => ship.every((c) => oppHits.has(c))).flat(),
  );

  function fire(cell: number) {
    if (pending || !myTurn || !fireable.has(cell)) return;
    setPending(true);
    playCue("flip");
    m.send({ type: "FIRE", cell });
  }

  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  const coords = (grid: ReactNode) => (
    <div className="bs-board">
      <span className="bs-corner" />
      <div className="bs-coords bs-coords--top">
        {COL_LETTERS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="bs-coords bs-coords--left">
        {Array.from({ length: SIZE }, (_, r) => (
          <span key={r}>{r + 1}</span>
        ))}
      </div>
      {grid}
    </div>
  );

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
              {coords(
                <div className="bs-grid">
                  {Array.from({ length: SIZE * SIZE }).map((_, cell) => {
                    const shot = myShots.includes(cell);
                    const hit = myHits.has(cell);
                    const sunk = oppSunk.has(cell);
                    return (
                      <button
                        key={cell}
                        type="button"
                        onClick={() => fire(cell)}
                        className={cn(
                          "bs-cell",
                          !shot && !pending && myTurn && fireable.has(cell) && "bs-cell--fireable",
                          shot && (hit ? "bs-cell--hit" : "bs-cell--miss"),
                          sunk && "bs-cell--sunk",
                          fresh?.mine === true && cell === fresh.cell && "bs-cell--fresh",
                        )}
                      >
                        {shot ? (hit ? "✸" : "•") : ""}
                      </button>
                    );
                  })}
                </div>,
              )}
            </BoardFrame>
          </div>

          {/* My fleet. */}
          <div className="flex flex-col items-center gap-2">
            <ScorePill label={user?.displayName ?? t("game.you")} value={t("battleship.yourFleet")} />
            <BoardFrame>
              {coords(
                <div className="bs-grid bs-grid--mine">
                  {Array.from({ length: SIZE * SIZE }).map((_, cell) => {
                    const ship = myShips.has(cell);
                    const shot = oppShots.has(cell);
                    const hit = oppHits.has(cell);
                    const sunk = mySunk.has(cell);
                    return (
                      <span
                        key={cell}
                        className={cn(
                          "bs-cell",
                          ship && "bs-cell--ship",
                          shot && (hit ? "bs-cell--hit" : "bs-cell--miss"),
                          sunk && "bs-cell--sunk",
                          fresh?.mine === false && cell === fresh.cell && "bs-cell--fresh",
                        )}
                      >
                        {shot ? (hit ? "✸" : "•") : ""}
                      </span>
                    );
                  })}
                </div>,
              )}
            </BoardFrame>
          </div>
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
