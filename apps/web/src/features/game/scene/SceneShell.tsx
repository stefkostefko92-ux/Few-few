import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import type { GameOverMsg, MatchFoundMsg } from "@aso/shared";
import "../cards/cards.css";

type Phase = "searching" | "playing" | "over";

/** Title bar + leave button shared by every game scene. */
export function SceneHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-3xl text-brass-300">{title}</h1>
      <Button variant="ghost" onClick={() => navigate("/")}>
        {t("game.leave")}
      </Button>
    </div>
  );
}

/** Centered searching spinner. */
export function Searching() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border border-brass-400/15 bg-felt-800/80 px-10 py-12">
      <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
      <p className="text-ink-300">{t("game.searching")}</p>
    </div>
  );
}

/** Win/Loss/Draw card with MMR delta + sound; rendered on game over. */
export function GameOverPanel({ seat, result }: { seat: number; result: GameOverMsg }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mine = result.score.find((s) => s.seat === seat)?.result;
  const delta = result.ratingDeltas[seat] ?? 0;
  useEffect(() => {
    playCue(mine === "win" ? "win" : "loss");
  }, [mine]);
  return (
    <div className="mx-auto mt-6 w-full max-w-sm rounded-panel border border-brass-400/20 bg-felt-800/90 p-6 text-center shadow-lift">
      <h2 className="mb-2 text-3xl text-brass-300">
        {mine === "win" ? t("game.youWin") : mine === "loss" ? t("game.youLose") : t("game.draw")}
      </h2>
      <p className="tnum text-ink-300">
        MMR {delta >= 0 ? "+" : ""}
        {delta}
      </p>
      <Button className="mt-6 w-full" onClick={() => navigate("/")}>
        {t("game.backToLobby")}
      </Button>
    </div>
  );
}

/** Brass-bordered score pill. */
export function ScorePill({ label, value, highlight }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div
      className="rounded-full border px-4 py-1.5 text-sm"
      style={{
        borderColor: highlight ? "var(--brass-300)" : "rgba(217,178,95,.2)",
        background: "rgba(11,14,13,.5)",
        color: highlight ? "var(--brass-100)" : "var(--ink-300)",
      }}
    >
      {label}: <span className="tnum font-bold">{value}</span>
    </div>
  );
}

/** A hand card that captures its DOM node so the scene can animate the play. */
export function HandCard({
  card,
  index,
  overlap = 28,
  playable,
  size = "md",
  onPlay,
}: {
  card: string;
  index: number;
  overlap?: number;
  playable: boolean;
  size?: "sm" | "md" | "lg";
  onPlay: (card: string, node: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ marginLeft: index ? -overlap : 0 }}>
      <PlayingCard
        card={card}
        size={size}
        dimmed={!playable}
        onClick={playable ? () => onPlay(card, ref.current) : undefined}
      />
    </div>
  );
}

/** Standard wrapper: header + (searching | children | game over). */
export function Scene({
  title,
  phase,
  ready,
  seat,
  result,
  children,
}: {
  title: string;
  phase: Phase;
  /** True once state has arrived and the table can render. */
  ready: boolean;
  seat: number;
  result: GameOverMsg | null;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <SceneHeader title={title} />
      {!ready || phase === "searching" ? (
        <div className="mx-auto max-w-md text-center">
          {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : <Searching />}
        </div>
      ) : (
        <>
          {children}
          {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : null}
        </>
      )}
    </div>
  );
}

/** Relative seat position helper for N-handed tables. */
export type { MatchFoundMsg };
