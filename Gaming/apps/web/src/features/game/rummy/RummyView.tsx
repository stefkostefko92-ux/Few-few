import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RUMMY_LIMIT,
  RUMMY_OPEN_MIN,
  arrangeMeld,
  extendMeld,
  isJoker,
  jokerSwapIndex,
  penaltyValue,
  rummyFace,
  rummyRank,
  rummySuit,
  type RummyAction,
  type RummyMeld,
  type RummyRoundResult,
  type RummyState,
} from "@aso/game-core";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useCardFlight } from "../anim/useCardFlight";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { useGameEvents } from "../useGameEvents";
import { useMatch } from "../useMatch";
import { Scene, ScorePill, fitOverlap } from "../scene/SceneShell";

/**
 * Българско реми (виж engines/draw-discard/rummy.ts). Сървърът е източникът на
 * истината; клиентът ползва същите чисти помощници от game-core само за
 * подсказки (точки на избраното, дали картите пасват към комбинация).
 */

const SIZES = { sm: { w: 60, h: 84 }, md: { w: 88, h: 124 } } as const;
const SUIT_ORDER = "SHDC";
const RANK_ORDER = "A23456789TJQK";

function positionsFor(count: number, mySeat: number): Map<number, SeatPos> {
  const order: SeatPos[] = count === 2 ? ["top"] : count === 3 ? ["left", "right"] : ["left", "top", "right"];
  const map = new Map<number, SeatPos>();
  for (let i = 1; i < count; i++) map.set((mySeat + i) % count, order[i - 1]!);
  return map;
}

/** Карта от реми: жокерът се рисува тук (PlayingCard не познава жокер). */
function RummyCard({
  card,
  size = "md",
  selected,
  dimmed,
  onClick,
  style,
  label,
}: {
  card: string;
  size?: "sm" | "md";
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  label: string;
}) {
  const lift: React.CSSProperties = selected ? { transform: "translateY(-14px)", filter: "drop-shadow(0 0 6px var(--brass-300))" } : {};
  if (!isJoker(card)) {
    return (
      <div style={{ ...style, ...lift, transition: "transform .12s" }}>
        <PlayingCard card={rummyFace(card)} size={size} dimmed={dimmed} onClick={onClick} />
      </div>
    );
  }
  const { w, h } = SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={label}
      className="aso-card"
      style={{
        ...style,
        ...lift,
        width: w,
        height: h,
        borderRadius: 10,
        background: "linear-gradient(160deg,#fbf6e9,#efe3c2)",
        border: "1px solid rgba(120,90,30,.45)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#7a1f2b",
        fontWeight: 800,
        opacity: dimmed ? 0.55 : 1,
        transition: "transform .12s",
        boxShadow: "0 2px 6px rgba(0,0,0,.35)",
      }}
    >
      <span style={{ fontSize: size === "md" ? 34 : 24, lineHeight: 1 }} aria-hidden>
        🃏
      </span>
      <span style={{ fontSize: size === "md" ? 11 : 9, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</span>
    </Tag>
  );
}

function sortHand(hand: string[]): string[] {
  const key = (c: string) =>
    isJoker(c) ? 999 : SUIT_ORDER.indexOf(rummySuit(c)) * 20 + RANK_ORDER.indexOf(rummyRank(c));
  return [...hand].sort((a, b) => key(a) - key(b));
}

export function RummyView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<RummyState, RummyAction>("RUMMY");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const stockRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);
  const { flyGhost } = useCardFlight(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const nameFor = (s: number) =>
    s === seat ? (user?.displayName ?? t("game.you")) : (players.find((p) => p.seat === s)?.displayName ?? `#${s + 1}`);
  const jokerLabel = t("rummy.joker");

  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      const evSeat = typeof ev.seat === "number" ? ev.seat : -1;
      const mine = evSeat === seat;
      const name = evSeat >= 0 ? nameFor(evSeat) : "";
      switch (ev.type) {
        case "OPEN":
          return { text: t("rummy.openBanner", { name, pts: Number(ev.points) || 0 }), tone: mine ? "win" : "brass" };
        case "ROUND_END":
          if (ev.exhausted) return { text: t("rummy.exhaustedBanner"), tone: "brass" };
          return ev.hand
            ? { text: t("rummy.handBanner", { name }), tone: mine ? "win" : "loss" }
            : { text: t("rummy.outBanner", { name }), tone: mine ? "win" : "brass" };
        case "MATCH":
          return { text: t("rummy.matchBanner", { name }), tone: mine ? "win" : "loss" };
        default:
          return null;
      }
    },
  });

  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number };
      if (ev.seat === seat) continue;
      if (ev.type === "DRAW" || ev.type === "TAKE") {
        playCue("flip");
        flyGhost(ev.type === "TAKE" ? discardRef.current : stockRef.current, "top");
      } else if (ev.type === "DISCARD") {
        playCue("flip");
        flyGhost("top", discardRef.current);
      } else if (ev.type === "OPEN" || ev.type === "MELD" || ev.type === "LAYOFF") {
        playCue("flip");
      }
    }
  });

  // ── локално състояние: избрани карти, натрупано отваряне, подредба ──
  const [selected, setSelected] = useState<string[]>([]);
  const [staged, setStaged] = useState<string[][]>([]);
  const [sorted, setSorted] = useState(true);
  const hand = useMemo(() => state?.hands[seat] ?? [], [state, seat]);
  const opened = !!state?.opened[seat];
  const inPlay = myTurn && state?.phase === "PLAY";

  // Изчисти избора, ако картите вече не са в ръката (след ход / нов рунд).
  useEffect(() => {
    setSelected((sel) => sel.filter((c) => hand.includes(c)));
    setStaged((st) => (st.every((g) => g.every((c) => hand.includes(c))) ? st : []));
  }, [hand]);
  useEffect(() => {
    if (!inPlay) setStaged([]);
  }, [inPlay]);

  const dealtForRef = useRef(0);
  useEffect(() => {
    if (state && dealtForRef.current !== state.round && hand.length > 0) {
      dealtForRef.current = state.round;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, hand.length, dealIn]);

  // Отчет за рунда — изскача при нов `lastRound` (не при презареждане).
  const [report, setReport] = useState<RummyRoundResult | null>(null);
  const seenRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    const lr = state.lastRound;
    if (seenRoundRef.current === null) {
      seenRoundRef.current = lr?.round ?? 0;
      return;
    }
    if (lr && lr.round > seenRoundRef.current) {
      seenRoundRef.current = lr.round;
      setReport(lr);
    }
  }, [state]);
  useEffect(() => {
    if (!report) return;
    const id = setTimeout(() => setReport(null), 12000);
    return () => clearTimeout(id);
  }, [report]);

  const stagedCards = staged.flat();
  const free = hand.filter((c) => !stagedCards.includes(c));
  const shown = sorted ? sortHand(free) : free;
  const selMeld = selected.length >= 3 ? arrangeMeld(selected) : null;
  const selPts = selected.reduce((a, c) => a + (isJoker(c) ? 0 : penaltyValue(c)), 0);
  const stagedPts = staged.reduce((a, g) => a + (arrangeMeld(g)?.value ?? 0), 0);
  const leavesOne = (n: number) => hand.length - n >= 1;
  const pending = state?.mustUse.filter((c) => hand.includes(c)) ?? [];

  const drawA = legal.find((a) => a.type === "DRAW");
  const takeA = legal.find((a) => a.type === "TAKE");
  const discardOk = inPlay && pending.length === 0 && selected.length === 1 && staged.length === 0;
  const meldOk = inPlay && opened && !!selMeld && leavesOne(selected.length);
  const stageOk = inPlay && !opened && !!selMeld && leavesOne(stagedCards.length + selected.length);
  const openOk =
    inPlay && !opened && stagedPts >= RUMMY_OPEN_MIN && leavesOne(stagedCards.length) && pending.every((c) => stagedCards.includes(c));

  const toggle = (c: string) => {
    if (!inPlay) return;
    setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  };

  const send = (a: RummyAction) => {
    playCue("flip");
    m.send(a);
  };

  function onDraw(action: RummyAction, from: HTMLElement | null) {
    flyGhost(from, "bottom");
    send(action);
  }

  function onDiscard() {
    const card = selected[0];
    if (!discardOk || !card) return;
    flyGhost(document.querySelector<HTMLElement>(`[data-rcard="${card}"]`), discardRef.current);
    setSelected([]);
    send({ type: "DISCARD", card });
  }

  /** Натиснат е комбинация на масата: долепване на избраните или смяна на жокер. */
  function meldAction(meld: RummyMeld): RummyAction | null {
    if (!inPlay || !opened || selected.length === 0) return null;
    if (leavesOne(selected.length) && extendMeld(meld, selected)) return { type: "LAYOFF", meldId: meld.id, cards: selected };
    const only = selected[0];
    if (selected.length === 1 && only && hand.length >= 2 && jokerSwapIndex(meld, only) >= 0) {
      return { type: "SWAP", meldId: meld.id, card: only };
    }
    return null;
  }

  const top = state?.discard[state.discard.length - 1];
  const seats = state?.seats ?? 2;
  const positions = positionsFor(seats, seat);
  const overlap = fitOverlap(shown.length, "md");

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result} wide>
      {state ? (
        <>
          <div ref={tableRef} style={{ position: "relative" }}>
            <Announcements banners={banners} />
            <FeltTable crest="🃏" feltColor="#163a2c" feltDark="#0a1d15">
              {[...positions.entries()].map(([s, pos]) => (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={
                    <span className="tnum text-xs">
                      🂠 {state.hands[s]?.length ?? 0} · {state.scores[s] ?? 0}
                      {state.opened[s] ? " ✓" : ""}
                    </span>
                  }
                >
                  <div style={{ display: "flex" }}>
                    {Array.from({ length: Math.min(state.hands[s]?.length ?? 0, 10) }).map((_, i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -40 : 0 }} />
                    ))}
                  </div>
                </Seat>
              ))}

              <TableCenter>
                <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "center" }}>
                  <div ref={stockRef} style={{ textAlign: "center" }}>
                    <PlayingCard
                      card="?"
                      size="md"
                      onClick={drawA ? () => onDraw(drawA, stockRef.current) : undefined}
                    />
                    <p className="mt-1 text-xs text-ink-muted">
                      {t("rummy.stock")}: <span className="tnum">{state.stock.length}</span>
                    </p>
                  </div>
                  <div ref={discardRef} style={{ textAlign: "center" }}>
                    {top ? (
                      <RummyCard
                        key={`${top}-${state.discard.length}`}
                        card={top}
                        label={jokerLabel}
                        onClick={takeA ? () => onDraw(takeA, discardRef.current) : undefined}
                        dimmed={myTurn && state.phase === "DRAW" && !takeA}
                      />
                    ) : (
                      <div style={{ width: 88, height: 124, borderRadius: 10, border: "1px dashed rgba(217,178,95,.3)" }} />
                    )}
                    <p className="mt-1 text-xs text-ink-muted">{t("rummy.discard")}</p>
                  </div>
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={nameFor(seat)}
                active={myTurn}
                badge={
                  <span className="tnum text-xs">
                    {state.scores[seat] ?? 0} · {opened ? t("rummy.opened") : t("rummy.notOpened")}
                  </span>
                }
              >
                <div className="aso-myhand" style={{ display: "flex", paddingTop: 16 }}>
                  {shown.map((card, i) => (
                    <div key={card} data-rcard={card} style={{ marginLeft: i ? -overlap : 0 }}>
                      <RummyCard
                        card={card}
                        label={jokerLabel}
                        selected={selected.includes(card)}
                        dimmed={!inPlay}
                        onClick={inPlay ? () => toggle(card) : undefined}
                        style={pending.includes(card) ? { outline: "2px solid var(--brass-300)", borderRadius: 10 } : undefined}
                      />
                    </div>
                  ))}
                </div>
              </Seat>
            </FeltTable>

            {report ? (
              <div
                role="dialog"
                aria-label={t("rummy.roundReport", { n: report.round })}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(7,10,9,.74)",
                  borderRadius: 24,
                }}
              >
                <div
                  className="rounded-panel border border-brass-400/25 bg-felt-800/95 p-4"
                  style={{ width: "min(92%, 600px)", maxHeight: "94%", overflowY: "auto" }}
                >
                  <h3 className="text-center text-lg text-brass-300">{t("rummy.roundReport", { n: report.round })}</h3>
                  <p className="mt-1 text-center text-sm text-ink-300">
                    {report.exhausted
                      ? t("rummy.exhaustedBanner")
                      : report.hand
                        ? t("rummy.handBanner", { name: nameFor(report.outSeat ?? 0) })
                        : t("rummy.outBanner", { name: nameFor(report.outSeat ?? 0) })}
                  </p>
                  {report.penalties.map((p, s) => (
                    <div key={s} className="mt-3">
                      <p className="text-xs text-ink-muted">
                        {nameFor(s)} — {t("rummy.penalty")}: <b className="tnum">{p}</b> · {t("rummy.total")}:{" "}
                        <b className="tnum">{report.scores[s] ?? 0}</b>
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", marginTop: 4 }}>
                        {(report.hands[s] ?? []).map((c, j) => (
                          <RummyCard key={c} card={c} size="sm" label={jokerLabel} style={{ marginLeft: j ? -34 : 0 }} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 text-center">
                    <Button variant="brass" onClick={() => setReport(null)}>
                      {t("rummy.continue")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Масата: комбинациите по играчи; натисни, за да долепиш/смениш жокер. */}
          <section className="mt-4 rounded-panel border border-brass-400/20 bg-felt-900/60 p-3" aria-label={t("rummy.table")}>
            <h3 className="text-xs uppercase tracking-wide text-brass-300">{t("rummy.table")}</h3>
            {state.melds.length === 0 ? (
              <p className="mt-1 text-xs text-ink-muted">{t("rummy.emptyTable")}</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                {state.melds.map((meld) => {
                  const a = meldAction(meld);
                  return (
                    <button
                      key={meld.id}
                      type="button"
                      disabled={!a}
                      onClick={() => {
                        if (!a) return;
                        setSelected([]);
                        send(a);
                      }}
                      title={a ? (a.type === "SWAP" ? t("rummy.swapHere") : t("rummy.layoffHere")) : nameFor(meld.owner)}
                      aria-label={`${nameFor(meld.owner)}: ${meld.cards.map((c) => (isJoker(c) ? jokerLabel : rummyFace(c))).join(" ")}`}
                      className="rounded-lg p-1"
                      style={{
                        display: "flex",
                        border: a ? "1px solid var(--brass-300)" : "1px solid transparent",
                        cursor: a ? "pointer" : "default",
                        background: a ? "rgba(217,178,95,.08)" : "transparent",
                      }}
                    >
                      {meld.cards.map((c, j) => (
                        <RummyCard key={c} card={c} size="sm" label={jokerLabel} style={{ marginLeft: j ? -36 : 0 }} />
                      ))}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Натрупано отваряне (неотворен играч). */}
          {staged.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {staged.map((g, i) => (
                <div key={i} style={{ display: "flex" }}>
                  {(arrangeMeld(g)?.cards ?? g).map((c, j) => (
                    <RummyCard key={c} card={c} size="sm" label={jokerLabel} style={{ marginLeft: j ? -36 : 0 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill
              label={t("rummy.score")}
              value={state.scores[seat] ?? 0}
              highlight={(state.scores[seat] ?? 0) <= Math.min(...state.scores)}
            />
            <ScorePill
              label={t("rummy.phase")}
              value={state.phase === "PLAY" ? t("rummy.playPhase") : t("rummy.drawPhase")}
              highlight={myTurn}
            />
            <span className="tnum text-xs text-ink-muted">
              {t("rummy.round")} {state.round} · {t("rummy.limit", { limit: RUMMY_LIMIT })}
            </span>
          </div>

          {inPlay ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="tnum text-xs text-ink-300">
                {t("rummy.selected", { count: selected.length, pts: selMeld ? selMeld.value : selPts })}
                {selected.length >= 3 && !selMeld ? ` · ${t("rummy.notMeld")}` : ""}
              </span>
              {!opened ? (
                <>
                  <Button
                    variant="felt"
                    disabled={!stageOk}
                    onClick={() => {
                      setStaged((s) => [...s, selected]);
                      setSelected([]);
                    }}
                  >
                    {t("rummy.addToOpening")}
                  </Button>
                  <span className="tnum text-xs text-brass-200">
                    {t("rummy.openingTotal", { pts: stagedPts, min: RUMMY_OPEN_MIN })}
                  </span>
                  <Button
                    variant="brass"
                    disabled={!openOk}
                    onClick={() => {
                      send({ type: "OPEN", melds: staged });
                      setStaged([]);
                      setSelected([]);
                    }}
                  >
                    {t("rummy.open", { pts: stagedPts })}
                  </Button>
                  {staged.length > 0 ? (
                    <Button variant="felt" onClick={() => setStaged([])}>
                      {t("rummy.clearOpening")}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  variant="brass"
                  disabled={!meldOk}
                  onClick={() => {
                    send({ type: "MELD", cards: selected });
                    setSelected([]);
                  }}
                >
                  {t("rummy.meld")}
                </Button>
              )}
              <Button variant="brass" disabled={!discardOk} onClick={onDiscard}>
                {t("rummy.discardBtn")}
              </Button>
              <Button variant="felt" onClick={() => setSorted((v) => !v)}>
                {t("rummy.sort")}
              </Button>
            </div>
          ) : null}

          {myTurn ? (
            <p className="mt-2 text-center text-xs text-ink-muted">
              {state.phase === "DRAW"
                ? t("rummy.drawHint")
                : pending.length > 0
                  ? opened
                    ? t("rummy.mustUseHint")
                    : t("rummy.mustOpenHint")
                  : selected.length > 0 && !leavesOne(selected.length + stagedCards.length)
                    ? t("rummy.keepOne")
                    : t("rummy.playHint")}
            </p>
          ) : null}
        </>
      ) : null}
    </Scene>
  );
}
