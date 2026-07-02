import { useEffect, useMemo, useRef, useState } from "react";
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
  // Pawn-promotion picker: the board hands us all variants of the move.
  const [promo, setPromo] = useState<ChessAction[] | null>(null);
  useEffect(() => {
    if (!myTurn) setPromo(null); // stale picker if the clock played for us
  }, [myTurn]);
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

  // Illegal move → red banner + error sound + a quick board shake.
  const boardWrapRef = useRef<HTMLDivElement>(null);
  function onIllegal() {
    announce(t("chess.illegal"), "loss", "error");
    const el = boardWrapRef.current;
    if (el) {
      el.classList.remove("aso-shake");
      void el.offsetWidth; // reflow so the animation can retrigger
      el.classList.add("aso-shake");
    }
  }

  return (
    <MatchChrome title={title} phase={phase} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <Announcements banners={banners} fixed />
          <div className="flex w-full items-center justify-between">
            <Badge tone="felt">{opponent}</Badge>
            <TurnBadge myTurn={myTurn} over={phase === "over"} />
          </div>

          <div ref={boardWrapRef}>
            <Board
              fen={state.fen}
              legalActions={legal}
              myTurn={myTurn && phase === "playing"}
              orientation={seat === 1 ? "black" : "white"}
              lastMove={state.lastMove}
              onMove={(a) => m.send(a)}
              onIllegal={onIllegal}
              onPromote={setPromo}
            />
            {promo ? (
              <div className="mt-3 flex items-center justify-center gap-2" role="group" aria-label={t("chess.promoteTitle")}>
                <span className="text-sm text-ink-300">{t("chess.promoteTitle")}:</span>
                {promo.map((a) => (
                  <button
                    key={a.promotion}
                    type="button"
                    onClick={() => {
                      m.send(a);
                      setPromo(null);
                    }}
                    className="rounded-card border border-brass-400/30 bg-felt-800 px-3 py-1.5 text-2xl leading-none text-ink-100 hover:border-brass-300"
                    aria-label={t(`chess.promo.${a.promotion ?? "q"}`)}
                  >
                    {{ q: "♛", r: "♜", b: "♝", n: "♞" }[a.promotion ?? "q"]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
        </div>
      ) : null}
    </MatchChrome>
  );
}
