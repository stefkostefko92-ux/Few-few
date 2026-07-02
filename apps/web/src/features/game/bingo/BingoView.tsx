import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
import "./bingo.css";

interface BingoState {
  cards: number[][]; // 25 cells, -1 = FREE
  drawn: number[];
  pos: number;
  seats: number;
}
type BingoAction = { type: "DRAW" };

const LETTERS = ["B", "I", "N", "G", "O"];

/** Standard 75-ball call: the column letter tells you where to look (I-17). */
const ballLabel = (n: number): string => `${LETTERS[Math.floor((n - 1) / 15)]}-${n}`;

// Same win lines as the engine — used for the opponents' best-line progress.
const LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

function progress(card: number[], drawn: Set<number>): { marked: number; best: number } {
  const isMarked = (cell: number) => card[cell] === -1 || drawn.has(card[cell]!);
  let marked = 0;
  for (let i = 0; i < card.length; i++) if (isMarked(i)) marked++;
  let best = 0;
  for (const line of LINES) {
    const n = line.filter(isMarked).length;
    if (n > best) best = n;
  }
  return { marked, best };
}

export function BingoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BingoState, BingoAction>("BINGO");
  const { state, legal, seat, phase, result, players, send } = m;

  const canDraw = legal.some((a) => a.type === "DRAW");
  const drawnSet = new Set(state?.drawn ?? []);
  const last = state?.drawn[state.drawn.length - 1];
  const myCard = state?.cards[seat] ?? [];

  // "БИНГО!" moment for everyone — a foreign win must not be a silent loss.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type !== "WIN" || typeof ev.seat !== "number") return null;
      if (ev.seat === seat) return { text: t("bingo.bingo"), tone: "win" };
      const name = players.find((p) => p.seat === ev.seat)?.displayName ?? `#${ev.seat}`;
      return { text: t("bingo.winner", { name }), tone: "loss" };
    },
  });

  // Guard against the button + the pending auto-timer double-sending DRAW for
  // the same position: one request per state.pos, and the click clears the timer.
  const drawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentPos = useRef(-1);
  const requestDraw = useCallback(() => {
    if (drawTimer.current) {
      clearTimeout(drawTimer.current);
      drawTimer.current = null;
    }
    const pos = state?.pos ?? -1;
    if (pos < 0 || sentPos.current === pos) return;
    sentPos.current = pos;
    send({ type: "DRAW" });
  }, [state?.pos, send]);

  // Auto-draw with a rhythm — bingo has no decisions, just the reveal (§4.17).
  useEffect(() => {
    if (canDraw && state) {
      drawTimer.current = setTimeout(requestDraw, 1100);
      return () => {
        if (drawTimer.current) {
          clearTimeout(drawTimer.current);
          drawTimer.current = null;
        }
      };
    }
  }, [canDraw, state, requestDraw]);

  // Every client hears the ball drop, not just the seat driving the draw.
  const drawnCount = state?.drawn.length ?? 0;
  const prevDrawn = useRef(drawnCount);
  useEffect(() => {
    if (drawnCount > prevDrawn.current) playCue("flip");
    prevDrawn.current = drawnCount;
  }, [drawnCount]);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <FeltTable crest="B" feltColor="#3a2470" feltDark="#1a103a">
        <div className="bingo-layout">
          {/* The draw display. */}
          <div className="bingo-drum">
            <div key={last ?? "-"} className="bingo-ball">{last != null ? ballLabel(last) : "—"}</div>
            <p className="mt-2 text-sm text-ink-300">{t("bingo.drawn", { n: state.drawn.length })}</p>
            <div className="bingo-recent">
              {state.drawn.slice(-8).reverse().map((n) => (
                <span key={n} className="bingo-recent-ball">{n}</span>
              ))}
            </div>
            {canDraw ? (
              <Button className="mt-3" onClick={requestDraw}>{t("bingo.draw")}</Button>
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

          {/* Opponents' progress — cards are public, so show how close each is. */}
          <div className="bingo-rivals">
            {state.cards.map((card, s) => {
              if (s === seat) return null;
              const { marked, best } = progress(card, drawnSet);
              const name = players.find((p) => p.seat === s)?.displayName ?? `#${s}`;
              return (
                <div key={s} className={cn("bingo-rival", best >= 4 && "bingo-rival--hot")}>
                  <span className="bingo-rival-name">{name}</span>
                  <span className="bingo-rival-line">{t("bingo.bestLine", { n: best })}</span>
                  <span className="bingo-rival-marks">{marked}/25</span>
                </div>
              );
            })}
          </div>
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
