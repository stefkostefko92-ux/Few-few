import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useCardFlight } from "../anim/useCardFlight";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { useGameEvents } from "../useGameEvents";
import { useMatch } from "../useMatch";
import { Scene, ScorePill, HandCard } from "../scene/SceneShell";

/** The previous deal fully revealed by the engine (public — see rummy.ts). */
interface RummyShowdown {
  dealNo: number;
  knocker: number | null;
  winner: number | null;
  gin: boolean;
  undercut: boolean;
  dead: boolean;
  melds: string[][][]; // [seat][meld][card]
  unmatched: string[][]; // [seat][card]
  layoffs: string[];
  deadwood: [number, number];
  points: number;
  matchScore: [number, number];
}

interface RummyState {
  hands: string[][];
  stock: string[];
  discard: string[];
  turn: number;
  phase: "DRAW" | "DISCARD";
  matchScore: [number, number];
  dealNo: number;
  showdown: RummyShowdown | null;
}
type RummyAction =
  | { type: "DRAW"; from: "stock" | "discard" }
  | { type: "DISCARD"; card: string }
  | { type: "KNOCK"; card: string };

/** Compact face-up card strip (melds / deadwood in the showdown report). */
function CardStrip({ cards, dim }: { cards: string[]; dim?: boolean }) {
  return (
    <div style={{ display: "flex", opacity: dim ? 0.55 : 1 }}>
      {cards.map((c, j) => (
        <PlayingCard key={`${c}-${j}`} card={c} size="sm" style={{ marginLeft: j ? -34 : 0 }} />
      ))}
    </div>
  );
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

  const opp = seat === 0 ? 1 : 0;
  const myTurn = !!state && state.turn === seat && legal.length > 0;

  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");
  const myName = user?.displayName ?? t("game.you");
  const nameFor = (s: number) => (s === seat ? t("game.you") : oppName);

  // Deal/match announcements from the authoritative event stream. WIN carries
  // the same seat as DEAL_END, so only the latter becomes a banner.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      const evSeat = typeof ev.seat === "number" ? ev.seat : -1;
      const mine = evSeat === seat;
      const name = nameFor(evSeat);
      switch (ev.type) {
        case "KNOCK": {
          const pts = typeof ev.deadwood === "number" ? ev.deadwood : 0;
          return pts === 0
            ? { text: t("rummy.ginBanner", { name }), tone: mine ? "win" : "brass" }
            : { text: t("rummy.knockBanner", { name, pts }), tone: "brass" };
        }
        case "DEAL_END": {
          const pts = typeof ev.points === "number" ? ev.points : 0;
          const won = { text: t("rummy.dealWonBanner", { name, pts }), tone: mine ? ("win" as const) : ("loss" as const) };
          return ev.undercut ? [{ text: t("rummy.undercutBanner", { name }), tone: won.tone }, won] : won;
        }
        case "DEAD_HAND":
          return { text: t("rummy.deadHandBanner"), tone: "brass" };
        case "MATCH":
          return { text: t("rummy.matchBanner", { name }), tone: mine ? "win" : "loss" };
        default:
          return null;
      }
    },
  });

  // Opponent draws/discards fly between their seat and the piles (the events
  // land BEFORE the new state, so the pre-action DOM is still up).
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; from?: string };
      if (ev.seat === seat) continue; // my own actions animate on click
      if (ev.type === "DRAW") {
        playCue("flip");
        flyGhost(ev.from === "discard" ? discardRef.current : stockRef.current, "top");
      } else if (ev.type === "DISCARD") {
        playCue("flip");
        flyGhost("top", discardRef.current);
      }
    }
  });

  const drawStock = legal.find((a) => a.type === "DRAW" && a.from === "stock");
  const drawDiscard = legal.find((a) => a.type === "DRAW" && a.from === "discard");
  // Each hand card maps to its discard + (optional) knock action.
  const discardFor = useMemo(
    () => new Map(legal.filter((a) => a.type === "DISCARD").map((a) => [(a as { card: string }).card, a])),
    [legal],
  );
  const knockFor = useMemo(
    () => new Map(legal.filter((a) => a.type === "KNOCK").map((a) => [(a as { card: string }).card, a])),
    [legal],
  );
  const inDiscardPhase = state?.phase === "DISCARD";
  // Knock mode: the engine offers KNOCK per eligible card — let the player PICK
  // the card (mirrors discard) instead of auto-firing an arbitrary one.
  const [knockMode, setKnockMode] = useState(false);
  useEffect(() => {
    if (!myTurn) setKnockMode(false);
  }, [myTurn]);

  // Deal-in flight for MY hand — re-runs on every new deal, not just the first.
  const dealtForRef = useRef(0);
  useEffect(() => {
    if (state && dealtForRef.current !== state.dealNo && (state.hands[seat]?.length ?? 0) > 0) {
      dealtForRef.current = state.dealNo;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  // Showdown report: pops when the engine publishes a NEW revealed deal (the
  // table behind already holds the next hand). Skipped on (re)mount so a stale
  // report isn't replayed after a refresh.
  const [report, setReport] = useState<RummyShowdown | null>(null);
  const seenDealRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    const sd = state.showdown;
    if (seenDealRef.current === null) {
      seenDealRef.current = sd?.dealNo ?? 0;
      return;
    }
    if (sd && sd.dealNo > seenDealRef.current) {
      seenDealRef.current = sd.dealNo;
      setReport(sd);
    }
  }, [state]);
  useEffect(() => {
    if (!report) return;
    const id = setTimeout(() => setReport(null), 9000);
    return () => clearTimeout(id);
  }, [report]);

  function onDiscard(card: string, node: HTMLElement | null) {
    const a = knockMode ? knockFor.get(card) : discardFor.get(card);
    if (!a) return;
    setKnockMode(false);
    flyGhost(node, discardRef.current); // my card flies onto the pile
    playCue("flip");
    m.send(a);
  }

  function onDraw(action: RummyAction, from: HTMLElement | null) {
    flyGhost(from, "bottom");
    playCue("flip");
    m.send(action);
  }

  const top = state?.discard[state.discard.length - 1];
  const reportTitle = report
    ? report.dead
      ? t("rummy.deadHandBanner")
      : report.gin
        ? t("rummy.ginBanner", { name: nameFor(report.knocker ?? 0) })
        : t("rummy.knockBanner", {
            name: nameFor(report.knocker ?? 0),
            pts: report.deadwood[report.knocker ?? 0] ?? 0,
          })
    : "";

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef} style={{ position: "relative" }}>
            <Announcements banners={banners} />
            <FeltTable crest="🂠" feltColor="#163a2c" feltDark="#0a1d15">
              <Seat
                pos="top"
                name={oppName}
                active={state.turn === opp}
                badge={<span className="tnum">{state.hands[opp]?.length ?? 0}</span>}
              >
                <div style={{ display: "flex" }}>
                  {Array.from({ length: state.hands[opp]?.length ?? 0 }).map((_, i) => (
                    <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -24 : 0 }} />
                  ))}
                </div>
              </Seat>

              {/* Stock + discard piles in the center. */}
              <TableCenter>
                <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                  <div ref={stockRef} style={{ textAlign: "center" }}>
                    <PlayingCard
                      card="?"
                      size="md"
                      onClick={drawStock ? () => onDraw(drawStock, stockRef.current) : undefined}
                    />
                    <p className="mt-1 text-xs text-ink-muted">{t("rummy.stock")}: {state.stock.length}</p>
                  </div>
                  <div ref={discardRef} style={{ textAlign: "center" }}>
                    {top ? (
                      <PlayingCard
                        key={`${top}-${state.discard.length}`}
                        card={top}
                        size="md"
                        onClick={drawDiscard ? () => onDraw(drawDiscard, discardRef.current) : undefined}
                      />
                    ) : (
                      /* 88×124 = md card size, so the first discard doesn't shift the layout */
                      <div style={{ width: 88, height: 124, borderRadius: 10, border: "1px dashed rgba(217,178,95,.3)" }} />
                    )}
                    <p className="mt-1 text-xs text-ink-muted">{t("rummy.discard")}</p>
                  </div>
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={myName}
                active={myTurn}
                badge={<span className="tnum">{state.hands[seat]?.length ?? 0}</span>}
              >
                <div className="aso-myhand" style={{ display: "flex" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    <HandCard
                      key={`${card}-${i}`}
                      card={card}
                      index={i}
                      count={(state.hands[seat] ?? []).length}
                      playable={myTurn && inDiscardPhase && (knockMode ? knockFor.has(card) : discardFor.has(card))}
                      onPlay={onDiscard}
                    />
                  ))}
                </div>
              </Seat>
            </FeltTable>

            {/* Showdown report: who knocked, revealed melds, lay-offs, points. */}
            {report ? (
              <div
                role="dialog"
                aria-label={reportTitle}
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
                  style={{ width: "min(92%, 560px)", maxHeight: "94%", overflowY: "auto" }}
                >
                  <h3 className="text-center text-lg text-brass-300">
                    {reportTitle}
                    {report.undercut ? ` · ${t("rummy.undercutBanner", { name: nameFor(report.winner ?? 0) })}` : ""}
                  </h3>
                  {[seat, opp].map((s) => (
                    <div key={s} className="mt-3">
                      <p className="text-xs text-ink-muted">
                        {s === seat ? myName : oppName} — {t("rummy.deadwood")}:{" "}
                        <b className="tnum">{report.deadwood[s] ?? 0}</b>
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                        {(report.melds[s] ?? []).map((meld, i) => (
                          <CardStrip key={i} cards={meld} />
                        ))}
                        {(report.unmatched[s] ?? []).length > 0 ? (
                          <CardStrip cards={report.unmatched[s] ?? []} dim />
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {report.layoffs.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs text-ink-muted">{t("rummy.layoffs")}</p>
                      <div style={{ marginTop: 4 }}>
                        <CardStrip cards={report.layoffs} />
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-3 text-center text-sm text-ink-300">
                    {report.dead
                      ? t("rummy.deadHandBanner")
                      : t("rummy.dealWonBanner", { name: nameFor(report.winner ?? 0), pts: report.points })}
                  </p>
                  <p className="tnum mt-1 text-center text-xs text-ink-muted">
                    {t("rummy.match")}: {report.matchScore[seat] ?? 0} : {report.matchScore[opp] ?? 0}
                  </p>
                  <div className="mt-3 text-center">
                    <Button variant="brass" onClick={() => setReport(null)}>
                      {t("rummy.continue")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill
              label={t("rummy.match")}
              value={`${state.matchScore?.[seat] ?? 0} : ${state.matchScore?.[opp] ?? 0}`}
              highlight={(state.matchScore?.[seat] ?? 0) >= (state.matchScore?.[opp] ?? 0)}
            />
            <ScorePill
              label={t("rummy.phase")}
              value={inDiscardPhase ? t("rummy.discardPhase") : t("rummy.drawPhase")}
              highlight={myTurn}
            />
            <span className="tnum text-xs text-ink-muted">
              {t("rummy.dealNo")} {state.dealNo ?? 1} · {t("rummy.toHundred")}
            </span>
            {/* Knock: toggle a pick mode, then click the card to knock with. */}
            {myTurn && knockFor.size > 0 ? (
              <Button variant={knockMode ? "felt" : "brass"} onClick={() => setKnockMode((v) => !v)}>
                {knockMode ? t("rummy.cancelKnock") : t("rummy.knock")}
              </Button>
            ) : null}
          </div>
          {myTurn ? (
            <p className="mt-2 text-center text-xs text-ink-muted">
              {inDiscardPhase
                ? knockMode
                  ? t("rummy.knockHint")
                  : t("rummy.discardHint")
                : t("rummy.drawHint")}
            </p>
          ) : null}
        </>
      ) : null}
    </Scene>
  );
}
