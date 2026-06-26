import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Panel } from "../../../ui";
import type { GameOverMsg } from "@aso/shared";
import type { MatchPhase } from "../useMatch";

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
  const navigate = useNavigate();

  const myResult = result?.score.find((s) => s.seat === seat)?.result;
  const myDelta = result?.ratingDeltas[seat] ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[min(94vw,1240px)] flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-3xl text-brass-300">{title}</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {t("game.leave")}
        </Button>
      </div>

      {phase === "searching" ? (
        <Panel className="flex flex-col items-center gap-4 px-10 py-12">
          <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
          <p className="text-ink-300">{t("game.searching")}</p>
        </Panel>
      ) : (
        children
      )}

      {phase === "over" && myResult ? (
        <Panel className="w-full max-w-sm text-center">
          <h2 className="mb-2 text-3xl text-brass-300">
            {myResult === "win"
              ? t("game.youWin")
              : myResult === "loss"
                ? t("game.youLose")
                : t("game.draw")}
          </h2>
          <p className="tnum text-ink-300">
            MMR {myDelta >= 0 ? "+" : ""}
            {myDelta}
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate("/")}>
            {t("game.backToLobby")}
          </Button>
        </Panel>
      ) : null}
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
