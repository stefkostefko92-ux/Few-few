import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { Scene, ScorePill, HandCard } from "../scene/SceneShell";

interface RummyState {
  hands: string[][];
  stock: string[];
  discard: string[];
  turn: number;
  phase: "DRAW" | "DISCARD";
}
type RummyAction =
  | { type: "DRAW"; from: "stock" | "discard" }
  | { type: "DISCARD"; card: string }
  | { type: "KNOCK"; card: string };

export function RummyView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<RummyState, RummyAction>("RUMMY");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn, playCard } = useCardAnimations(tableRef);

  const opp = seat === 0 ? 1 : 0;
  const myTurn = !!state && state.turn === seat && legal.length > 0;

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

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  function onDiscard(card: string, node: HTMLElement | null) {
    const a = discardFor.get(card);
    if (!a) return;
    playCard(node);
    playCue("flip");
    m.send(a);
  }

  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");
  const top = state?.discard[state.discard.length - 1];

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef}>
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
                  <div style={{ textAlign: "center" }}>
                    <PlayingCard
                      card="?"
                      size="md"
                      onClick={drawStock ? () => { playCue("flip"); m.send(drawStock); } : undefined}
                    />
                    <p className="mt-1 text-xs text-ink-muted">{t("rummy.stock")}: {state.stock.length}</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {top ? (
                      <PlayingCard
                        card={top}
                        size="md"
                        onClick={drawDiscard ? () => { playCue("flip"); m.send(drawDiscard); } : undefined}
                      />
                    ) : (
                      <div style={{ width: 72, height: 102, borderRadius: 10, border: "1px dashed rgba(217,178,95,.3)" }} />
                    )}
                    <p className="mt-1 text-xs text-ink-muted">{t("rummy.discard")}</p>
                  </div>
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<span className="tnum">{state.hands[seat]?.length ?? 0}</span>}
              >
                <div className="aso-myhand" style={{ display: "flex" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    <HandCard
                      key={`${card}-${i}`}
                      card={card}
                      index={i}
                      playable={myTurn && inDiscardPhase && discardFor.has(card)}
                      onPlay={onDiscard}
                    />
                  ))}
                </div>
              </Seat>
            </FeltTable>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill
              label={t("rummy.phase")}
              value={inDiscardPhase ? t("rummy.discardPhase") : t("rummy.drawPhase")}
              highlight={myTurn}
            />
            {/* Knock is offered per-card; surface the best one as a button. */}
            {myTurn && knockFor.size > 0 ? (
              <Button
                onClick={() => {
                  const first = [...knockFor.values()][0];
                  if (first) m.send(first);
                }}
              >
                {t("rummy.knock")}
              </Button>
            ) : null}
          </div>
          {myTurn && inDiscardPhase ? (
            <p className="mt-2 text-center text-xs text-ink-muted">{t("rummy.discardHint")}</p>
          ) : null}
        </>
      ) : null}
    </Scene>
  );
}
