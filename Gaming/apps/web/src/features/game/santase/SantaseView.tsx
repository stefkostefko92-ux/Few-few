import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { type SuitChar } from "../cards/suits";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useTableFx, Announcements } from "../anim/useTableFx";
import { useTrickDisplay, TrickCardSlot } from "../anim/useTrickDisplay";
import { useMatch } from "../useMatch";
import { Scene, ScorePill, HandCard } from "../scene/SceneShell";

interface Play {
  seat: number;
  card: string;
}
interface SantaseState {
  hands: string[][];
  stock: string[];
  trump: string;
  trumpCard: string | null;
  turn: number;
  trick: Play[];
  points: [number, number];
  closed: boolean;
  matchPoints: [number, number];
  dealNo: number;
}
type SantaseAction =
  | { type: "PLAY"; card: string; marriage?: boolean }
  | { type: "CLOSE" }
  | { type: "EXCHANGE" };

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function SantaseView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<SantaseState, SantaseAction>("SANTASE");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);
  const opp = seat === 0 ? 1 : 0;
  const oppNameOf = (s: number) =>
    s === seat ? (user?.displayName ?? t("game.you")) : (players.find((p) => p.seat === s)?.displayName ?? t("game.opponent"));

  // Event-buffered trick centre: both cards fly in; the trick flies to its winner.
  const { displayTrick, registerHandOrigin, originFor, flight } = useTrickDisplay({
    matchId: m.matchId,
    seat,
    scopeRef: tableRef,
    stateTrick: state?.trick ?? null,
    posOf: (winner, mine) => (winner === mine ? "bottom" : "top"),
  });

  // Announce banners: 20/40, затваряне, размяна на 9-ката, край на раздаването.
  const { banners } = useTableFx({
    matchId: m.matchId,
    seat,
    scopeRef: tableRef,
    toBanner: (ev) => {
      if (ev.type === "MARRIAGE" && typeof ev.value === "number") {
        return { text: ev.value === 40 ? t("santase.forty") : t("santase.twenty"), tone: "win" };
      }
      if (ev.type === "CLOSE" && typeof ev.seat === "number")
        return { text: t("santase.closedBy", { name: oppNameOf(ev.seat) }), tone: "loss" };
      if (ev.type === "EXCHANGE" && typeof ev.seat === "number")
        return { text: t("santase.exchangedBy", { name: oppNameOf(ev.seat) }), tone: "brass" };
      if (ev.type === "DEAL_END" && typeof ev.seat === "number" && typeof ev.gamePoints === "number")
        return {
          text: t("santase.dealEnd", { name: oppNameOf(ev.seat), n: ev.gamePoints }),
          tone: ev.seat === seat ? "win" : "loss",
        };
      return null;
    },
  });

  const myTurn = !!state && state.turn === seat && legal.length > 0;

  // Prefer the marriage variant of a card when offered — unless the player has
  // armed "play quietly" (tactically legal: keep the announce for later).
  const [noAnnounce, setNoAnnounce] = useState(false);
  const hasMarriageChoice = useMemo(
    () => legal.some((a) => a.type === "PLAY" && a.marriage) && legal.some((a) => a.type === "PLAY" && !a.marriage),
    [legal],
  );
  const playFor = useMemo(() => {
    const map = new Map<string, SantaseAction>();
    for (const a of legal) {
      if (a.type !== "PLAY") continue;
      const cur = map.get(a.card);
      if (!cur || (noAnnounce ? !a.marriage : a.marriage)) map.set(a.card, a);
    }
    return map;
  }, [legal, noAnnounce]);
  useEffect(() => {
    if (!myTurn) setNoAnnounce(false);
  }, [myTurn]);
  const closeAction = legal.find((a) => a.type === "CLOSE");
  const exchangeAction = legal.find((a) => a.type === "EXCHANGE");

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  function onPlay(card: string, node: HTMLElement | null) {
    const action = playFor.get(card);
    if (!action) return;
    registerHandOrigin(card, node);
    playCue("flip");
    m.send(action);
  }

  const oppName = oppNameOf(opp);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef} style={{ position: "relative" }}>
            <Announcements banners={banners} />
            {/* Candlelit two-player duel (§4.2). */}
            <FeltTable crest={SUIT_GLYPH[state.trump]} feltColor="#15392c" feltDark="#0a1d15">
              {/* Closed-talon marker: the whole hand plays under затваряне rules. */}
              {state.closed ? (
                <span
                  className="aso-announce"
                  data-tone="loss"
                  style={{ position: "absolute", left: 24, top: 16, zIndex: 3 }}
                >
                  {t("santase.closedTag")}
                </span>
              ) : null}
              <Seat
                pos="top"
                name={oppName}
                active={state.turn === opp}
                badge={<span className="tnum">{state.points[opp] ?? 0}</span>}
              >
                <div style={{ display: "flex" }}>
                  {Array.from({ length: state.hands[opp]?.length ?? 0 }).map((_, i) => (
                    <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -22 : 0 }} />
                  ))}
                </div>
              </Seat>

              {/* Talon (stock) + face-up trump on the left rail. */}
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                }}
              >
                <div style={{ position: "relative", height: 102, width: 130 }}>
                  {state.trumpCard ? (
                    <div style={{ position: "absolute", left: 30, top: 18, transform: "rotate(90deg)" }}>
                      <PlayingCard card={state.trumpCard} size="md" />
                    </div>
                  ) : null}
                  {state.stock.length > 0 ? <PlayingCard card="?" size="md" /> : null}
                </div>
                <p className="tnum mt-1 text-center text-xs text-ink-muted">
                  {t("santase.stock", { count: state.stock.length })}
                </p>
              </div>

              <TableCenter>
                {displayTrick.length === 0 ? (
                  <span className="text-sm text-ink-muted">{t("belote.emptyTrick")}</span>
                ) : (
                  displayTrick.map((p) => (
                    <TrickCardSlot key={`${p.seat}-${p.card}`} play={p} originFor={originFor} flight={flight} />
                  ))
                )}
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<span className="tnum">{state.points[seat] ?? 0}</span>}
              >
                <div className="aso-myhand" style={{ display: "flex" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    <HandCard
                      key={`${card}-${i}`}
                      card={card}
                      index={i}
                      count={(state.hands[seat] ?? []).length}
                      playable={myTurn && playFor.has(card)}
                      onPlay={onPlay}
                    />
                  ))}
                </div>
              </Seat>

              <TrumpIndicator suit={state.trump as SuitChar} label={t("santase.trump")} />
            </FeltTable>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill label={t("game.you")} value={state.points[seat] ?? 0} highlight />
            <ScorePill label={oppName} value={state.points[opp] ?? 0} />
            <span className="text-xs text-ink-muted">
              {t("santase.match")}: {state.matchPoints?.[seat] ?? 0}:{state.matchPoints?.[opp] ?? 0} ·{" "}
              {t("santase.dealNo")} {state.dealNo ?? 1} · {t("santase.toEleven")}
            </span>
            {closeAction ? (
              <Button variant="felt" onClick={() => m.send(closeAction)}>
                {t("santase.close")}
              </Button>
            ) : null}
            {hasMarriageChoice ? (
              <Button variant={noAnnounce ? "brass" : "ghost"} onClick={() => setNoAnnounce((v) => !v)}>
                {noAnnounce ? t("santase.quietOn") : t("santase.quiet")}
              </Button>
            ) : null}
            {exchangeAction ? (
              <Button variant="felt" onClick={() => m.send(exchangeAction)}>
                {t("santase.exchange")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Scene>
  );
}
