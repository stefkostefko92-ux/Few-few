import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import { DominoTile } from "./DominoTile";
import "./domino.css";

interface DominoState {
  hands: string[][];
  boneyard: string[];
  line: string[];
  ends: [number, number] | null;
  turn: number;
  seats: number;
  matchScore: number[];
  roundNo: number;
  lastRound: { seat: number; reason: "out" | "blocked"; points: number } | null;
}
type DominoAction =
  | { type: "PLAY"; tile: string; side: "L" | "R" }
  | { type: "DRAW" }
  | { type: "PASS" };

export function DominoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<DominoState, DominoAction>("DOMINO");
  const { state, legal, seat, phase, result, players } = m;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "PASS" && ev.seat !== seat) return { text: t("fx.oppPass"), tone: "brass" };
      if (ev.type === "WIN" && ev.reason === "blocked") return { text: t("fx.blocked"), tone: "brass" };
      return null;
    },
  });
  const [side, setSide] = useState<"L" | "R">("R");

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const drawAction = legal.find((a) => a.type === "DRAW");
  const passAction = legal.find((a) => a.type === "PASS");

  // For each tile in hand, which sides can it be played on?
  const playsByTile = useMemo(() => {
    const map = new Map<string, Set<"L" | "R">>();
    for (const a of legal) {
      if (a.type !== "PLAY") continue;
      const set = map.get(a.tile) ?? new Set();
      set.add(a.side);
      map.set(a.tile, set);
    }
    return map;
  }, [legal]);

  function playTile(tile: string) {
    const sides = playsByTile.get(tile);
    if (!sides) return;
    const chosen = sides.has(side) ? side : [...sides][0]!;
    playCue("flip");
    m.send({ type: "PLAY", tile, side: chosen });
  }

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <div className="dom-layout">
          {/* Opponents (tile counts). */}
          <div className="flex flex-wrap justify-center gap-3">
            {[0, 1, 2, 3]
              .filter((s) => s < state.seats && s !== seat)
              .map((s) => (
                <ScorePill
                  key={s}
                  label={nameFor(s)}
                  value={`${state.hands[s]?.length ?? 0} 🀫`}
                  highlight={state.turn === s}
                />
              ))}
          </div>

          {/* The played line. */}
          <div className="dom-line">
            {state.line.length === 0 ? (
              <span className="text-sm text-ink-muted">{t("domino.empty")}</span>
            ) : (
              state.line.map((tile, i) => <DominoTile key={`${tile}-${i}`} tile={tile} />)
            )}
          </div>

          {/* Side selector + draw/pass. */}
          <div className="dom-controls">
            {state.ends ? (
              <div className="dom-side-toggle" role="group" aria-label={t("domino.side")}>
                <button
                  type="button"
                  className={cn("dom-side-btn", side === "L" && "dom-side-btn--on")}
                  onClick={() => setSide("L")}
                >
                  ◀ {state.ends[0]}
                </button>
                <button
                  type="button"
                  className={cn("dom-side-btn", side === "R" && "dom-side-btn--on")}
                  onClick={() => setSide("R")}
                >
                  {state.ends[1]} ▶
                </button>
              </div>
            ) : null}
            {drawAction ? (
              <Button variant="felt" disabled={!myTurn} onClick={() => { playCue("flip"); m.send(drawAction); }}>
                {t("domino.draw")} ({state.boneyard.length})
              </Button>
            ) : null}
            {passAction ? (
              <Button variant="ghost" disabled={!myTurn} onClick={() => m.send(passAction)}>
                {t("belote.pass")}
              </Button>
            ) : null}
          </div>

          {/* My hand. */}
          <div className="dom-hand">
            {(state.hands[seat] ?? []).map((tile, i) => (
              <DominoTile
                key={`${tile}-${i}`}
                tile={tile}
                vertical
                playable={myTurn && playsByTile.has(tile)}
                onClick={myTurn && playsByTile.has(tile) ? () => playTile(tile) : undefined}
              />
            ))}
          </div>
          <ScorePill
            label={user?.displayName ?? t("game.you")}
            value={myTurn ? t("game.yourTurn") : ""}
            highlight={myTurn}
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-ink-muted">
              {t("domino.round")} {state.roundNo ?? 1} · {t("domino.target")} 100
            </span>
            {(state.matchScore ?? []).map((pts, s) => (
              <span
                key={s}
                className="rounded-full border border-brass-400/25 bg-felt-900/60 px-2.5 py-1"
                style={{ color: s === seat ? "var(--brass-100)" : "var(--ink-300)" }}
              >
                {players.find((p) => p.seat === s)?.displayName ?? `#${s}`}: {pts}
              </span>
            ))}
          </div>
          {state.lastRound ? (
            <p className="mt-1 text-center text-xs text-ink-muted">
              {t("domino.lastRound")}: {players.find((p) => p.seat === state.lastRound!.seat)?.displayName ?? `#${state.lastRound!.seat}`}{" "}
              +{state.lastRound!.points} ({t(`domino.${state.lastRound!.reason}`)})
            </p>
          ) : null}
        </div>
      ) : null}
    </Scene>
  );
}
