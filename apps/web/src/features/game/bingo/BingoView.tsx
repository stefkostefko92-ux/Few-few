import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
import "./bingo.css";

interface BingoState {
  cards: number[][]; // 25 cells, -1 = FREE
  drawn: number[];
  pos: number;
  seats: number;
  turn: number;
}
type BingoAction = { type: "DRAW" };

const LETTERS = ["B", "I", "N", "G", "O"];

export function BingoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BingoState, BingoAction>("BINGO");
  const { state, legal, seat, phase, result, send } = m;

  const canDraw = legal.some((a) => a.type === "DRAW");
  const drawnSet = new Set(state?.drawn ?? []);
  const last = state?.drawn[state.drawn.length - 1];
  const myCard = state?.cards[seat] ?? [];

  // Auto-draw with a rhythm — bingo has no decisions, just the reveal (§4.17).
  useEffect(() => {
    if (canDraw && state) {
      const id = setTimeout(() => {
        playCue("flip");
        send({ type: "DRAW" });
      }, 1100);
      return () => clearTimeout(id);
    }
  }, [canDraw, state, send]);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <FeltTable crest="B" feltColor="#3a2470" feltDark="#1a103a">
        <div className="bingo-layout">
          {/* The draw display. */}
          <div className="bingo-drum">
            <div key={last ?? "-"} className="bingo-ball">{last ?? "—"}</div>
            <p className="mt-2 text-sm text-ink-300">{t("bingo.drawn", { n: state.drawn.length })}</p>
            <div className="bingo-recent">
              {state.drawn.slice(-8).reverse().map((n) => (
                <span key={n} className="bingo-recent-ball">{n}</span>
              ))}
            </div>
            {canDraw ? (
              <Button className="mt-3" onClick={() => m.send({ type: "DRAW" })}>{t("bingo.draw")}</Button>
            ) : null}
          </div>

          {/* My card. */}
          <div className="bingo-card">
            <div className="bingo-head">
              {LETTERS.map((l) => (
                <span key={l} className="bingo-letter">{l}</span>
              ))}
            </div>
            <div className="bingo-grid">
              {myCard.map((n, i) => {
                const free = n === -1;
                const marked = free || drawnSet.has(n);
                return (
                  <span key={i} className={cn("bingo-cell", marked && "bingo-cell--marked", free && "bingo-cell--free")}>
                    {free ? "★" : n}
                  </span>
                );
              })}
            </div>
            <ScorePill label={user?.displayName ?? t("game.you")} value={t("bingo.yourCard")} highlight />
          </div>
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
