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
  const won = mine === "win";
  useEffect(() => {
    playCue(won ? "win" : "loss");
  }, [won]);
  return (
    <div className="cine-over" role="dialog" aria-modal="true">
      <div className={`cine-over__card cine-over__card--${mine ?? "draw"}`}>
        {won ? (
          <div className="cine-over__sparks" aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </div>
        ) : null}
        <p className="cine-over__kicker">{t("game.gameOver")}</p>
        <h2 className="cine-over__verdict">
          {won ? t("game.youWin") : mine === "loss" ? t("game.youLose") : t("game.draw")}
        </h2>
        <p className="cine-over__mmr tnum">
          MMR {delta >= 0 ? "+" : ""}
          {delta}
        </p>
        <Button className="mt-6 w-full" onClick={() => navigate("/")}>
          {t("game.backToLobby")}
        </Button>
      </div>
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

const CARD_W = { sm: 60, md: 88, lg: 120 } as const;

/** Target hand width — scales with the monitor (compact on phones, spread on
 *  big screens) so the larger cards make full use of the adaptive table. */
function handTarget(): number {
  const w = typeof window === "undefined" ? 1024 : window.innerWidth;
  return Math.round(Math.min(Math.max(w * 0.82, 320), 600));
}

/** Overlap (px) so a hand of `count` cards fits ~`target`px wide — more overlap
 *  for bigger hands (e.g. Bridge/Kent's 13) so they never clip on mobile. */
export function fitOverlap(count: number, size: "sm" | "md" | "lg" = "md", target = handTarget()): number {
  if (count <= 1) return 0;
  const W = CARD_W[size];
  const step = (target - W) / (count - 1);
  const min = size === "sm" ? 16 : 22;
  return Math.min(W - 16, Math.max(min, W - step));
}

/** A hand card that captures its DOM node so the scene can animate the play.
 *  Pass `count` (hand size) for an auto-fit overlap, or a fixed `overlap`. */
export function HandCard({
  card,
  index,
  count,
  overlap = 28,
  playable,
  size = "md",
  onPlay,
}: {
  card: string;
  index: number;
  count?: number;
  overlap?: number;
  playable: boolean;
  size?: "sm" | "md" | "lg";
  onPlay: (card: string, node: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ov = count !== undefined ? fitOverlap(count, size) : overlap;
  return (
    <div ref={ref} style={{ marginLeft: index ? -ov : 0 }}>
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
  wide,
}: {
  title: string;
  phase: Phase;
  /** True once state has arrived and the table can render. */
  ready: boolean;
  seat: number;
  result: GameOverMsg | null;
  children: ReactNode;
  /** Wide tables (e.g. Магнат) get the full viewport instead of max-w-4xl. */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "mx-auto w-full max-w-[min(96vw,1500px)]" : "mx-auto w-full max-w-[min(94vw,1240px)]"}>
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
