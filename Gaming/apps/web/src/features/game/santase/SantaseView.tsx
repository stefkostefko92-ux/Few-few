import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { type SuitChar } from "../cards/suits";
import { FeltTable, Seat } from "../table/FeltTable";
import { useNarrowTable } from "../table/useNarrowTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useTableFx, Announcements } from "../anim/useTableFx";
import { useTrickDisplay, TrickCardSlot } from "../anim/useTrickDisplay";
import { useMatch } from "../useMatch";
import { Scene, ScorePill, HandCard } from "../scene/SceneShell";
import { DecisionPrompt } from "../scene/DecisionPrompt";

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
  | { type: "EXCHANGE" }
  | { type: "DECLARE"; marriage?: string };

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
/** „9♣“, „10♥“ — карта като текст в прозореца за решение. */
const cardText = (c: string) => `${c[0] === "T" ? "10" : c.slice(0, -1)}${SUIT_GLYPH[c.slice(-1)] ?? ""}`;

/** Talon geometry: the face-down stock with the face-up trump card tucked
 *  under it sideways. The box spans BOTH cards, so the stock counter below it
 *  is never covered (it used to sit under the 124px stock card). */
const TALON = {
  md: { box: { width: 136, height: 124 }, trump: { left: 30, top: 18 } },
  sm: { box: { width: 92, height: 84 }, trump: { left: 20, top: 12 } },
} as const;

export function SantaseView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<SantaseState, SantaseAction>("SANTASE");
  const { state, legal, seat, phase, result, players } = m;
  const narrow = useNarrowTable();
  const talonSize = narrow ? "sm" : "md";

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
      if (ev.type === "DECLARE" && typeof ev.seat === "number" && typeof ev.points === "number") {
        const name = oppNameOf(ev.seat);
        return ev.valid
          ? { text: t("santase.declaredOk", { name, n: ev.points }), tone: ev.seat === seat ? "win" : "loss" }
          : { text: t("santase.declaredFalse", { name, n: ev.points }), tone: ev.seat === seat ? "loss" : "win" };
      }
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
  // „Имам 66“ — играчът сам преценява (невярното обявяване носи 3 точки на съперника).
  const declareActions = legal.filter((a): a is Extract<SantaseAction, { type: "DECLARE" }> => a.type === "DECLARE");
  // 20/40 при водене: поп или дама от двойка, изиграни с обява.
  const marriagePlays = legal.filter(
    (a): a is Extract<SantaseAction, { type: "PLAY" }> => a.type === "PLAY" && !!a.marriage,
  );
  const marriageValue = (card: string) => (card.slice(-1) === state?.trump ? 40 : 20);
  // Точките, които играчът реално знае: своите взятки + зачетените двойки
  // (`points`), плюс двойката, обявена заедно с „Имам 66“ (сървърът я предлага
  // само когато вече има взятка, т.е. когато се зачита).
  const declarePoints = (a: Extract<SantaseAction, { type: "DECLARE" }>) =>
    (state?.points[seat] ?? 0) + (a.marriage ? marriageValue(a.marriage) : 0);
  const declareReady = declareActions.filter((a) => declarePoints(a) >= 66);

  // Обявите на моето водене идват като прозорец само когато има какво да се
  // реши: двойка, смяна на коза или реално 66. „Затвори“ и „Имам 66“ без 66 са
  // възможни на почти всяко водене — те не го отварят, а са в прозореца, щом е
  // отворен, иначе — малки бутони върху сукното (едно място за решението).
  const onLead = myTurn && !!state && state.trick.length === 0;
  const leadKey = state
    ? `lead-${state.dealNo}-${state.hands[seat]?.length ?? 0}-${state.hands[opp]?.length ?? 0}-${state.stock.length}`
    : "lead";
  const leadPrompt =
    phase === "playing" && onLead && (!!exchangeAction || marriagePlays.length > 0 || declareReady.length > 0);
  const [skippedLead, setSkippedLead] = useState<string | null>(null);
  const callsInPrompt = leadPrompt && skippedLead !== leadKey;
  const smallCalls =
    onLead && !callsInPrompt && (!!closeAction || hasMarriageChoice || declareActions.length > 0 || !!exchangeAction);

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  /** Карта от ръката; `explicit` — изборът от прозореца (напр. поп с обява). */
  function onPlay(card: string, node: HTMLElement | null, explicit?: SantaseAction) {
    const action = explicit ?? playFor.get(card);
    if (!action) return;
    // от прозореца картата пак излита от мястото си в ръката
    const from =
      node ?? tableRef.current?.querySelector<HTMLElement>(`[data-zone="hand"] [data-card="${card}"]`)?.parentElement ?? null;
    registerHandOrigin(card, from);
    playCue("flip");
    m.send(action);
  }

  const oppName = oppNameOf(opp);

  const sendCall = (a: SantaseAction) => {
    playCue("flip");
    m.send(a);
  };
  const declareLabel = (a: Extract<SantaseAction, { type: "DECLARE" }>) =>
    a.marriage
      ? t("santase.declareWith", { n: marriageValue(a.marriage), suit: SUIT_GLYPH[a.marriage.slice(-1)] ?? "" })
      : t("santase.declare");

  /** „Затвори“, „Смени коза“, „Без анонс“ и „Имам 66“ — в прозореца или на сукното. */
  const leadCalls = (inPrompt: boolean) => {
    // under the popup's big choices — or, without the popup, small on the felt
    const size = inPrompt ? "!py-2" : "!px-3 !py-1.5 text-sm";
    return (
      <>
        {inPrompt
          ? declareReady.map((a) => (
              <Button
                key={`ready-${a.marriage ?? "plain"}`}
                variant="brass"
                className="!py-2"
                data-action={a.marriage ? "declare-marriage" : "declare"}
                data-marriage={a.marriage}
                onClick={() => sendCall(a)}
              >
                {declareLabel(a)}
              </Button>
            ))
          : null}
        {inPrompt
          ? marriagePlays.map((a) => (
              <Button
                key={`m-${a.card}`}
                variant="brass"
                className="!py-2"
                data-action="marriage"
                data-card={a.card}
                onClick={() => onPlay(a.card, null, a)}
              >
                {t(a.card[0] === "K" ? "santase.announceKing" : "santase.announceQueen", {
                  n: marriageValue(a.card),
                  suit: SUIT_GLYPH[a.card.slice(-1)] ?? "",
                })}
              </Button>
            ))
          : null}
        {exchangeAction && state ? (
          <Button variant="felt" className={size} data-action="exchange" onClick={() => sendCall(exchangeAction)}>
            {state.trumpCard
              ? t("santase.exchangeWith", { nine: cardText(`9${state.trump}`), card: cardText(state.trumpCard) })
              : t("santase.exchange")}
          </Button>
        ) : null}
        {closeAction ? (
          <Button variant="felt" className={size} data-action="close" onClick={() => m.send(closeAction)}>
            {t("santase.close")}
          </Button>
        ) : null}
        {hasMarriageChoice ? (
          <Button
            variant={noAnnounce ? "brass" : "ghost"}
            className={size}
            data-action="quiet"
            aria-pressed={noAnnounce}
            title={t("santase.quietHint")}
            onClick={() => setNoAnnounce((v) => !v)}
          >
            {noAnnounce ? t("santase.quietOn") : t("santase.quiet")}
          </Button>
        ) : null}
        {/* „Имам 66“ без (известни) 66 — по желание, малко и встрани. */}
        {declareActions
          .filter((a) => !inPrompt || !declareReady.includes(a))
          .map((a) => (
            <Button
              key={a.marriage ?? "plain"}
              variant="ghost"
              className="!px-3 !py-1.5 text-sm"
              data-action={a.marriage ? "declare-marriage" : "declare"}
              data-marriage={a.marriage}
              title={t("santase.declareHint")}
              onClick={() => sendCall(a)}
            >
              {declareLabel(a)}
            </Button>
          ))}
      </>
    );
  };

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef} style={{ position: "relative" }}>
            <Announcements banners={banners} />
            {/* Candlelit two-player duel (§4.2). */}
            <FeltTable crest={SUIT_GLYPH[state.trump]} feltColor="#15392c" feltDark="#0a1d15">
              <Seat
                pos="top"
                name={oppName}
                active={state.turn === opp}
                badge={<span className="tnum">{state.points[opp] ?? 0}</span>}
              >
                <div style={{ display: "flex" }} data-zone="opponent">
                  {/* a tighter fan on phones keeps it clear of the trump card */}
                  {Array.from({ length: state.hands[opp]?.length ?? 0 }).map((_, i) => (
                    <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? (narrow ? -40 : -22) : 0 }} />
                  ))}
                </div>
              </Seat>

              {/* Talon (stock) + face-up trump on the left rail. */}
              <div
                data-zone="talon"
                style={{
                  position: "absolute",
                  left: narrow ? 10 : 24,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ position: "relative", ...TALON[talonSize].box }}>
                  {state.trumpCard ? (
                    <div style={{ position: "absolute", ...TALON[talonSize].trump, transform: "rotate(90deg)" }}>
                      <PlayingCard card={state.trumpCard} size={talonSize} />
                    </div>
                  ) : null}
                  {state.stock.length > 0 ? (
                    <PlayingCard card="?" size={talonSize} style={{ position: "absolute", left: 0, top: 0 }} />
                  ) : null}
                </div>
                <p className="tnum mt-1 text-center text-xs text-ink-muted" data-stock={state.stock.length}>
                  {t("santase.stock", { count: state.stock.length })}
                </p>
                {/* Closed-talon marker under the talon it describes: the rest of
                    the hand plays under затваряне rules. (As an announce ribbon
                    pinned top-left it covered the trump indicator and its own
                    first letters were clipped off the felt.) */}
                {state.closed ? (
                  <span
                    data-testid="santase-closed"
                    className="mt-1 rounded-full border border-loss/60 bg-loss/80 px-2.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-white shadow-lift"
                    style={{ maxWidth: TALON[talonSize].box.width + 16 }}
                  >
                    {t("santase.closedTag")}
                  </span>
                ) : null}
              </div>

              {/* The trick. On a phone it sits right of centre so the talon on
                  the left rail never covers the cards. */}
              <div
                className="aso-table__center"
                data-zone="trick"
                style={narrow ? { left: `calc(50% + ${TALON.sm.box.width / 2}px)` } : undefined}
              >
                {displayTrick.length === 0 ? (
                  <span className="text-sm text-ink-muted">{t("belote.emptyTrick")}</span>
                ) : (
                  displayTrick.map((p) => (
                    <TrickCardSlot key={`${p.seat}-${p.card}`} play={p} originFor={originFor} flight={flight} />
                  ))
                )}
              </div>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<span className="tnum">{state.points[seat] ?? 0}</span>}
              >
                <div className="aso-myhand" data-zone="hand" style={{ display: "flex" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    // keyed by the card (unique in a hand): an index key remounted
                    // every card right of a played one and replayed its deal-in
                    <HandCard
                      key={card}
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

              {/* „Затвори“ / „Имам 66“ без прозорец: малки бутони върху сукното —
                  на лаптоп на дясната релса срещу талона, на телефон в празната
                  ивица под ветрилото на съперника. (Като лепкав ред под масата
                  покриваха табелата с моите точки — точно по които се решава
                  „66“, а на телефон бяха под ръба на екрана.) */}
              {smallCalls ? (
                <div
                  data-zone="actions"
                  className={`flex gap-2 rounded-panel bg-felt-900/70 p-1.5 ${
                    narrow ? "flex-wrap items-center justify-center" : "flex-col items-stretch"
                  }`}
                  style={
                    narrow
                      ? { position: "absolute", left: "50%", top: 150, transform: "translateX(-50%)", zIndex: 4, width: "max-content", maxWidth: "calc(100% - 24px)" }
                      : { position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)", zIndex: 4, maxWidth: 230 }
                  }
                >
                  {leadCalls(false)}
                </div>
              ) : null}
            </FeltTable>
          </div>

          <div
            className="mt-4 flex flex-wrap items-center justify-center gap-3"
            data-zone="score"
            data-points={state.points[seat] ?? 0}
            data-opp-points={state.points[opp] ?? 0}
            data-match={`${state.matchPoints?.[seat] ?? 0}:${state.matchPoints?.[opp] ?? 0}`}
            data-deal={state.dealNo ?? 1}
            data-trump={state.trump}
          >
            <ScorePill label={t("game.you")} value={state.points[seat] ?? 0} highlight />
            <ScorePill label={oppName} value={state.points[opp] ?? 0} />
            <span className="text-xs text-ink-muted">
              {t("santase.match")}: {state.matchPoints?.[seat] ?? 0}:{state.matchPoints?.[opp] ?? 0} ·{" "}
              {t("santase.dealNo")} {state.dealNo ?? 1} · {t("santase.toEleven")}
            </span>
          </div>
          <DecisionPrompt
            open={leadPrompt}
            promptKey={leadKey}
            title={declareReady.length > 0 ? t("santase.have66Title") : t("santase.leadTitle")}
            hint={t("santase.leadHint", {
              pts: state.points[seat] ?? 0,
              suit: SUIT_GLYPH[state.trump] ?? "",
              count: state.stock.length,
            })}
            // On my lead the trick is empty: the middle of the felt is free on
            // a laptop. A phone's popup spans the felt and would cover the
            // talon on the left rail — there it goes to the top third.
            placement={narrow ? "top" : "center"}
            optional={{ label: t("decision.notNow"), onSkip: () => setSkippedLead(leadKey) }}
            testId="santase-lead"
          >
            <div data-zone="lead-calls" className="flex flex-wrap items-center justify-center gap-2">
              {leadCalls(true)}
            </div>
          </DecisionPrompt>
        </>
      ) : null}
    </Scene>
  );
}
