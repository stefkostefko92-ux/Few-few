import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Panel } from "../../../ui";
import type { GameOverMsg } from "@aso/shared";
import type { MatchPhase } from "../useMatch";
import { GameOverPanel, SceneHeader } from "../scene/SceneShell";

interface Props {
  title: string;
  phase: MatchPhase;
  seat: number;
  result: GameOverMsg | null;
  children: ReactNode;
}

/** Shared header, searching spinner, and game-over panel for all game views. */
export function MatchChrome({ title, phase, seat, result, children }: Props) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-[min(94vw,1240px)] flex-col items-center gap-6">
      {/* Shared header: leaving mid-match resigns the seat (no bot finishing for us). */}
      <div className="w-full">
        <SceneHeader title={title} />
      </div>

      {phase === "searching" ? (
        <Panel className="flex flex-col items-center gap-4 px-10 py-12">
          <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
          <p className="text-ink-300">{t("game.searching")}</p>
        </Panel>
      ) : (
        children
      )}

      {/* The shared verdict overlay (on <body>, always in view) — the inline
          panel used to land below the board, off-screen on a laptop. */}
      {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : null}
    </div>
  );
}

/** Turn indicator badge used by card games. */
export function TurnBadge({ myTurn, over }: { myTurn: boolean; over: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge tone={myTurn && !over ? "brass" : "felt"}>
      {over ? t("game.gameOver") : myTurn ? t("game.yourTurn") : t("game.opponentTurn")}
    </Badge>
  );
}
