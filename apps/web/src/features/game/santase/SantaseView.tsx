import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { type SuitChar } from "../cards/suits";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
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
  const { dealIn, playCard } = useCardAnimations(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const opp = seat === 0 ? 1 : 0;

  // Prefer the marriage variant of a card when it's offered (always beneficial).
  const playFor = useMemo(() => {
    const map = new Map<string, SantaseAction>();
    for (const a of legal) {
      if (a.type !== "PLAY") continue;
      const cur = map.get(a.card);
      if (!cur || a.marriage) map.set(a.card, a);
    }
    return map;
  }, [legal]);
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
    playCard(node);
    playCue("flip");
    m.send(action);
  }

  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef}>
            {/* Candlelit two-player duel (§4.2). */}
            <FeltTable crest={SUIT_GLYPH[state.trump]} feltColor="#15392c" feltDark="#0a1d15">
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
                {state.trick.length === 0 ? (
                  <span className="text-sm text-ink-muted">{t("belote.emptyTrick")}</span>
                ) : (
                  state.trick.map((p) => <PlayingCard key={p.seat} card={p.card} size="md" />)
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
