import { useCallback, useEffect, useRef, useState } from "react";
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
  marks: number[][]; // marked cell indices per seat (own marks only)
  auto: boolean[];
  blockedUntil: number[];
  voided: number[][];
  falseCalls: number[];
  closing: boolean;
  winners: number[];
}
type BingoAction =
  | { type: "MARK"; seat: number; cell: number }
  | { type: "BINGO"; seat: number }
  | { type: "AUTO"; seat: number; on: boolean };

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

/** Прогрес по СОБСТВЕНИТЕ маркировки на играча (те решават „Бинго!“). */
function progress(marks: number[]): { marked: number; best: number } {
  const set = new Set(marks);
  set.add(12);
  let best = 0;
  for (const line of LINES) {
    const n = line.filter((c) => set.has(c)).length;
    if (n > best) best = n;
  }
  return { marked: set.size, best };
}

export function BingoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BingoState, BingoAction>("BINGO");
  const { state, seat, phase, result, players, send } = m;

  const drawnSet = new Set(state?.drawn ?? []);
  const last = state?.drawn[state.drawn.length - 1];
  const myCard = state?.cards[seat] ?? [];
  const myMarks = new Set(state?.marks?.[seat] ?? []);
  const myVoid = new Set(state?.voided?.[seat] ?? []);
  const blockedLeft = state ? Math.max(0, (state.blockedUntil?.[seat] ?? 0) - state.drawn.length) : 0;
  const iWon = !!state?.winners?.includes(seat);
  const auto = !!state?.auto?.[seat];
  const canAct = !!state && phase === "playing" && blockedLeft === 0;

  const nameOf = (s: number) =>
    s === seat ? (user?.displayName ?? t("game.you")) : (players.find((p) => p.seat === s)?.displayName ?? `#${s}`);

  // „Бинго!“, невярно викане и наказание — за всички на масата.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WIN" && typeof ev.seat === "number") {
        if (ev.seat === seat) return { text: t("bingo.bingo"), tone: "win" };
        return { text: t("bingo.winner", { name: nameOf(ev.seat) }), tone: "loss" };
      }
      if (ev.type === "PENALTY" && typeof ev.seat === "number") {
        return ev.seat === seat
          ? { text: t("bingo.falseYou", { n: 3 }), tone: "loss" }
          : { text: t("bingo.falseOther", { name: nameOf(ev.seat) }), tone: "brass" };
      }
      if (ev.type === "NO_WINNER") return { text: t("bingo.noWinner"), tone: "brass" };
      return null;
    },
  });

  // Едно изпращане на клетка до следващото състояние (без двойни кликове).
  const [pending, setPending] = useState<Set<number>>(new Set());
  useEffect(() => setPending(new Set()), [state]);

  function mark(cell: number) {
    if (!state || !canAct || cell === 12 || myMarks.has(cell) || pending.has(cell)) return;
    const n = myCard[cell];
    if (n === undefined || !drawnSet.has(n) || myVoid.has(n)) return;
    setPending((p) => new Set(p).add(cell));
    playCue("flip");
    send({ type: "MARK", seat, cell });
  }
  const callBingo = useCallback(() => {
    if (!canAct || iWon) return;
    playCue("flip");
    send({ type: "BINGO", seat });
  }, [canAct, iWon, send, seat]);

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
          <div className="bingo-drum" data-drawn={state.drawn.length} data-last={last ?? ""} data-closing={state.closing ? "true" : undefined}>
            <div key={last ?? "-"} className="bingo-ball">{last !== undefined && last !== null ? ballLabel(last) : "—"}</div>
            <p className="mt-2 text-sm text-ink-300">{t("bingo.drawn", { n: state.drawn.length })}</p>
            <div className="bingo-recent">
              {state.drawn.slice(-8).reverse().map((n) => (
                <span key={n} className="bingo-recent-ball">{n}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {state.closing ? t("bingo.closing") : t("bingo.serverDraws")}
            </p>
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
                const marked = free || myMarks.has(i) || pending.has(i);
                const voided = !free && myVoid.has(n);
                const markable = !free && !marked && !voided && canAct && drawnSet.has(n);
                return (
                  <button
                    key={i}
                    type="button"
                    data-bingo-cell={i}
                    data-number={n}
                    // Потвърдено от сървъра (без оптимистичното „чакащо“ маркиране).
                    data-marked={free || myMarks.has(i) ? "true" : undefined}
                    data-markable={markable ? "true" : undefined}
                    data-void={voided ? "true" : undefined}
                    onClick={() => mark(i)}
                    disabled={!markable}
                    aria-pressed={marked}
                    aria-label={free ? t("bingo.free") : String(n)}
                    className={cn(
                      "bingo-cell",
                      marked && "bingo-cell--marked",
                      free && "bingo-cell--free",
                      markable && "bingo-cell--markable",
                      voided && "bingo-cell--void",
                    )}
                  >
                    {free ? "★" : n}
                  </button>
                );
              })}
            </div>
            <ScorePill label={user?.displayName ?? t("game.you")} value={t("bingo.yourCard")} highlight />
            <div className="bingo-controls">
              <Button data-action="bingo" onClick={callBingo} disabled={!canAct || iWon} className="bingo-call">
                {t("bingo.call")}
              </Button>
              <label className="bingo-auto">
                <input
                  type="checkbox"
                  data-action="auto"
                  checked={auto}
                  onChange={(e) => send({ type: "AUTO", seat, on: e.target.checked })}
                  disabled={phase !== "playing"}
                />
                {t("bingo.autoMark")}
              </label>
            </div>
            {blockedLeft > 0 ? (
              <p className="bingo-penalty" role="status" data-penalty={blockedLeft}>
                {t("bingo.penalty", { n: blockedLeft })}
              </p>
            ) : (
              <p className="text-xs text-ink-muted">{t("bingo.markHint")}</p>
            )}
          </div>

          {/* Opponents' progress — cards are public, so show how close each is. */}
          <div className="bingo-rivals">
            {state.cards.map((_card, s) => {
              if (s === seat) return null;
              const { marked, best } = progress(state.marks?.[s] ?? []);
              const name = players.find((p) => p.seat === s)?.displayName ?? `#${s}`;
              return (
                <div key={s} className={cn("bingo-rival", best >= 4 && "bingo-rival--hot")} data-rival={s} data-best={best}>
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
