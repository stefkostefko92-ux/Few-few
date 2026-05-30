import { useTranslation } from "react-i18next";
import { Badge } from "../../../ui";
import { useAuthStore } from "../../../lib/store";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { useMatch } from "../useMatch";
import { ChessBoard } from "./ChessBoard";
import type { ChessAction, ChessState } from "./types";

export function ChessView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<ChessState, ChessAction>("CHESS");
  const { state, legal, seat, turn, phase, result, players } = m;

  const myTurn = turn === seat && legal.length > 0;
  const opponent = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full items-center justify-between">
            <Badge tone="felt">{opponent}</Badge>
            <TurnBadge myTurn={myTurn} over={phase === "over"} />
          </div>

          <ChessBoard
            fen={state.fen}
            legalActions={legal}
            myTurn={myTurn && phase === "playing"}
            orientation={seat === 1 ? "black" : "white"}
            lastMove={state.lastMove}
            onMove={(a) => m.send(a)}
          />

          <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
        </div>
      ) : null}
    </MatchChrome>
  );
}
