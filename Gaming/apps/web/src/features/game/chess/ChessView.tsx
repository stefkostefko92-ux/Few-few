import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "../../../ui";
import { useAuthStore } from "../../../lib/store";
import { MatchChrome, TurnBadge } from "../cards/MatchChrome";
import { DecisionPrompt } from "../scene/DecisionPrompt";
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
  // „Предай се“ / „Предложи реми“ искат потвърждение в прозореца за решение —
  // без случайни загуби от погрешен клик (по-рано: „Сигурен?“ за 3 s).
  const [confirm, setConfirm] = useState<"resign" | "draw" | null>(null);
  // Брояч на отварянията: всяко ново отваряне е ново решение (promptKey), иначе
  // прозорецът, отказан веднъж на същата позиция, не се показва пак.
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    if (!myTurn) {
      setPromo(null); // stale picker if the clock played for us
      setConfirm(null);
    }
  }, [myTurn]);
  // Едно решение наведнъж: новото затваря предишното.
  const pickPromotion = (options: ChessAction[]) => {
    setAsk((n) => n + 1);
    setConfirm(null);
    setPromo(options);
  };
  const askConfirm = (what: "resign" | "draw") => {
    setAsk((n) => n + 1);
    setPromo(null);
    setConfirm(what);
  };

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
              onPromote={pickPromotion}
            />
          </div>

          {/* На телефон бутоните минават на нов ред, вместо да се пречупят на две. */}
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
            {phase === "playing" ? (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Button
                  variant="ghost"
                  className="!px-3"
                  data-action="draw-offer"
                  disabled={!canOfferDraw}
                  onClick={() => askConfirm("draw")}
                >
                  {t("chess.offerDraw", "Предложи реми")}
                </Button>
                <Button
                  variant="ghost"
                  className="!px-3"
                  data-action="resign"
                  disabled={!canResign}
                  onClick={() => askConfirm("resign")}
                >
                  {t("chess.resign", "Предай се")}
                </Button>
              </div>
            ) : null}
          </div>

          {/* Решенията — прозорец, който идва сам (масата остава видима). */}
          <DecisionPrompt
            open={!!promo && myTurn && phase === "playing"}
            promptKey={`promo-${ask}-${promo?.[0]?.from ?? ""}${promo?.[0]?.to ?? ""}`}
            title={t("chess.promoteHeading")}
            hint={t("chess.promoteHint")}
            optional={{ label: t("chess.otherMove"), onSkip: () => setPromo(null) }}
            testId="chess-promotion"
          >
            <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label={t("chess.promoteTitle")}>
              {(promo ?? []).map((a) => (
                <button
                  key={a.promotion}
                  type="button"
                  data-action="promote"
                  data-piece={a.promotion}
                  onClick={() => {
                    m.send(a);
                    setPromo(null);
                  }}
                  className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-card border border-brass-400/30 bg-felt-800 px-3 py-2 text-ink-100 hover:border-brass-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">
                    {glyphs[a.promotion ?? "q"]}
                  </span>
                  <span className="text-xs">{t(`chess.promo.${a.promotion ?? "q"}`)}</span>
                </button>
              ))}
            </div>
          </DecisionPrompt>

          <DecisionPrompt
            open={oppOffersDraw && !!acceptDraw && !promo && confirm === null}
            promptKey={`draw-offer-${state.fen}`}
            title={t("chess.drawOffered", "Съперникът предлага реми")}
            hint={t("chess.drawOfferHint")}
            placement="top"
            optional={{ label: t("chess.declineDraw") }}
            testId="chess-draw-offer"
          >
            <Button data-action="draw-accept" onClick={() => acceptDraw && m.send(acceptDraw)}>
              {t("chess.acceptDraw", "Приеми реми")}
            </Button>
          </DecisionPrompt>

          <DecisionPrompt
            open={confirm !== null && phase === "playing" && (confirm === "resign" ? canResign : canOfferDraw)}
            promptKey={`confirm-${confirm ?? ""}-${ask}`}
            title={confirm === "resign" ? t("chess.resignQ") : t("chess.offerDrawQ")}
            hint={confirm === "resign" ? t("chess.resignHint") : t("chess.offerDrawHint")}
            optional={{ label: t("chess.keepPlaying"), onSkip: () => setConfirm(null) }}
            testId="chess-confirm"
          >
            {confirm === "resign" ? (
              <Button
                data-action="resign-confirm"
                className="!bg-none !bg-loss !text-ink-100"
                onClick={() => {
                  setConfirm(null);
                  m.send({ type: "RESIGN" });
                }}
              >
                {t("chess.resign", "Предай се")}
              </Button>
            ) : (
              <Button
                data-action="draw-offer-confirm"
                onClick={() => {
                  setConfirm(null);
                  m.send({ type: "DRAW_OFFER" });
                }}
              >
                {t("chess.offerDraw", "Предложи реми")}
              </Button>
            )}
          </DecisionPrompt>
        </div>
      ) : null}
    </MatchChrome>
  );
}
