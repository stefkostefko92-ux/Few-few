import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../ui";
import { useAuthStore } from "../../../lib/store";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { useMatch } from "../useMatch";
import { ChessBoard } from "./ChessBoard";
import { ChessBoard3D } from "./ChessBoard3D";
import type { ChessAction, ChessState } from "./types";

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ChessView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<ChessState, ChessAction>("CHESS");
  const { state, legal, seat, turn, phase, result, players } = m;
  const useGL = useMemo(webglSupported, []);

  const myTurn = turn === seat && legal.length > 0;
  const opponent = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");
  const Board = useGL ? ChessBoard3D : ChessBoard;

  // Check / checkmate / draw announcements (the opponent must see them too).
  const { banners, announce } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "CHECK")
        return { text: t("chess.check"), tone: ev.seat === seat ? "loss" : "win" };
      if (ev.type === "CHECKMATE")
        return { text: ev.seat === seat ? t("chess.mateWin") : t("chess.checkmate"), tone: ev.seat === seat ? "win" : "loss" };
      if (ev.type === "DRAW") return { text: t("chess.drawn"), tone: "brass" };
      return null;
    },
  });

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <Announcements banners={banners} fixed />
          <div className="flex w-full items-center justify-between">
            <Badge tone="felt">{opponent}</Badge>
            <TurnBadge myTurn={myTurn} over={phase === "over"} />
          </div>

          <Board
            fen={state.fen}
            legalActions={legal}
            myTurn={myTurn && phase === "playing"}
            orientation={seat === 1 ? "black" : "white"}
            lastMove={state.lastMove}
            onMove={(a) => m.send(a)}
            onIllegal={() => announce(t("chess.illegal"), "loss")}
          />

          <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
        </div>
      ) : null}
    </MatchChrome>
  );
}
