import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "../../../ui";
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

/** Wire actions beyond plain moves (mirrors the engine's ChessAction union). */
type ChessCtrlAction =
  | ChessAction
  | { type: "RESIGN" }
  | { type: "DRAW_OFFER" }
  | { type: "DRAW_ACCEPT" };

/** Server state carries the pending draw offer (seat index) too. */
type ChessViewState = ChessState & { drawOffer?: number | null };

const WHITE_GLYPHS = { q: "♕", r: "♖", b: "♗", n: "♘" } as const;
const BLACK_GLYPHS = { q: "♛", r: "♜", b: "♝", n: "♞" } as const;

export function ChessView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<ChessViewState, ChessCtrlAction>("CHESS");
  const { state, legal, seat, turn, phase, result, players } = m;
  const useGL = useMemo(webglSupported, []);

  const moveActions = useMemo(
    () => legal.filter((a): a is ChessAction => a.type === "MOVE"),
    [legal],
  );
  const canResign = legal.some((a) => a.type === "RESIGN");
  const canOfferDraw = legal.some((a) => a.type === "DRAW_OFFER");
  const acceptDraw = legal.find((a) => a.type === "DRAW_ACCEPT");

  const myTurn = turn === seat && moveActions.length > 0;
  // Pawn-promotion picker: the board hands us all variants of the move.
  const [promo, setPromo] = useState<ChessAction[] | null>(null);
  useEffect(() => {
    if (!myTurn) setPromo(null); // stale picker if the clock played for us
  }, [myTurn]);
  // "Resign" arms first ("Сигурен?") and disarms after 3s — no misclick losses.
  const [resignArmed, setResignArmed] = useState(false);
  useEffect(() => {
    if (!resignArmed) return;
    const id = setTimeout(() => setResignArmed(false), 3000);
    return () => clearTimeout(id);
  }, [resignArmed]);

  const opponent = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");
  const Board = useGL ? ChessBoard3D : ChessBoard;
  // Show the picker in the player's own colour (seat 0 = white).
  const glyphs = seat === 0 ? WHITE_GLYPHS : BLACK_GLYPHS;
  const oppOffersDraw =
    phase === "playing" && state?.drawOffer !== null && state?.drawOffer !== undefined && state.drawOffer !== seat;

  // Check / checkmate / draw / resign announcements (the opponent must see them too).
  const { banners, announce } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "CHECK")
        return { text: t("chess.check"), tone: ev.seat === seat ? "loss" : "win" };
      if (ev.type === "CHECKMATE")
        return { text: ev.seat === seat ? t("chess.mateWin") : t("chess.checkmate"), tone: ev.seat === seat ? "win" : "loss" };
      if (ev.type === "DRAW") {
        const reason = typeof ev.reason === "string" ? ev.reason : "";
        const text =
          reason === "stalemate"
            ? t("chess.stalemate", "Пат — реми")
            : reason === "threefold"
              ? t("chess.drawThreefold", "Реми — трикратно повторение")
              : reason === "agreement"
                ? t("chess.drawAgreement", "Реми по споразумение")
                : reason === "material"
                  ? t("chess.drawMaterial", "Реми — недостатъчен материал")
                  : reason === "fifty"
                    ? t("chess.drawFifty", "Реми — правило за 50-те хода")
                    : t("chess.drawn");
        return { text, tone: "brass" };
      }
      if (ev.type === "RESIGN")
        return ev.seat === seat
          ? { text: t("chess.youResigned", "Ти се предаде"), tone: "loss" }
          : { text: t("chess.oppResigned", "Съперникът се предаде"), tone: "win" };
      if (ev.type === "DRAW_OFFER")
        return ev.seat === seat
          ? { text: t("chess.drawOfferSent", "Предложение за реми — чакай отговор"), tone: "brass" }
          : { text: t("chess.drawOffered", "Съперникът предлага реми"), tone: "brass" };
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
              legalActions={moveActions}
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
                    {glyphs[a.promotion ?? "q"]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {oppOffersDraw ? (
            <div className="flex items-center gap-3 rounded-card border border-brass-400/30 bg-felt-800/80 px-4 py-2">
              <span className="text-sm text-brass-200">{t("chess.drawOffered", "Съперникът предлага реми")}</span>
              {acceptDraw ? (
                <Button onClick={() => m.send(acceptDraw)}>{t("chess.acceptDraw", "Приеми реми")}</Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex w-full items-center justify-between">
            <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
            {phase === "playing" ? (
              <div className="flex items-center gap-2">
                {!oppOffersDraw ? (
                  <Button
                    variant="ghost"
                    disabled={!canOfferDraw}
                    onClick={() => m.send({ type: "DRAW_OFFER" })}
                  >
                    {t("chess.offerDraw", "Предложи реми")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className={resignArmed ? "!text-loss" : undefined}
                  disabled={!canResign}
                  onClick={() => {
                    if (!resignArmed) {
                      setResignArmed(true);
                      return;
                    }
                    setResignArmed(false);
                    m.send({ type: "RESIGN" });
                  }}
                >
                  {resignArmed ? t("game.leaveConfirm") : t("chess.resign", "Предай се")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </MatchChrome>
  );
}
