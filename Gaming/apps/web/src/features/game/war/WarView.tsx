import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { useCardFlight, type CardFlight } from "../anim/useCardFlight";
import { useGameEvents } from "../useGameEvents";
import { Scene, ScorePill } from "../scene/SceneShell";

interface WarState {
  hands: string[][];
  pile: string[];
  table: [string | null, string | null];
  turn: number;
  flips: number;
  winner: number | null;
  done: boolean;
}
type WarAction = { type: "FLIP" };

/** A battle card that flies in from its owner's seat when it lands. */
function BattleCard({ card, from, flight }: { card: string; from: SeatPos; flight: CardFlight }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    flight.flyIn(ref.current, from);
  }, []);
  return (
    <span ref={ref} className="aso-trick-card" style={{ display: "inline-block" }}>
      <PlayingCard card={card} size="lg" />
    </span>
  );
}

export function WarView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<WarState, WarAction>("WAR");
  const { state, legal, seat, phase, result, players, send } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const flight = useCardFlight(tableRef);

  // Opponent-visible action announcements.
  const { banners, announce } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WAR") return { text: t("fx.war"), tone: "brass" };
      return null;
    },
  });

  const opp = seat === 0 ? 1 : 0;
  const canFlip = legal.some((a) => a.type === "FLIP");
  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  // TAKE: the fought-over cards visibly fly to whoever wins them. Cloned
  // synchronously — the very next state clears the table.
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; count?: number };
      if (ev.type === "TAKE" && typeof ev.seat === "number") {
        const nodes = tableRef.current?.querySelectorAll<HTMLElement>(".aso-trick-card") ?? [];
        flight.collect(nodes, ev.seat === seat ? "bottom" : "top", { delayMs: 420 });
        if ((ev.count ?? 0) > 3) announce(t("war.tookPile", { name: ev.seat === seat ? t("game.you") : oppName, n: ev.count }), ev.seat === seat ? "win" : "loss");
      }
    }
  });

  // Auto-flip with a small delay so the duel reads as a rhythm (War has no
  // decisions — FLIP is the only move; we pace it for drama, §4.4).
  const pileLen = state?.pile.length ?? 0;
  useEffect(() => {
    if (canFlip && state && !state.done) {
      const id = setTimeout(() => {
        playCue("flip");
        send({ type: "FLIP" });
      }, 900);
      return () => clearTimeout(id);
    }
  }, [canFlip, state, send]);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef} style={{ position: "relative" }}>
            <Announcements banners={banners} />
            <FeltTable crest="⚔" feltColor="#2a1530" feltDark="#120817">
              <Seat
                pos="top"
                name={oppName}
                active={state.turn === opp && !state.done}
                badge={<span className="tnum">{t("war.cards", { n: state.hands[opp]?.length ?? 0 })}</span>}
              >
                <PlayingCard card="?" size="md" />
              </Seat>

              <TableCenter>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {state.table[opp] ? (
                    <BattleCard key={`${state.flips}-o`} card={state.table[opp]!} from="top" flight={flight} />
                  ) : (
                    <span style={{ width: 96, height: 134 }} />
                  )}
                  {pileLen > 2 ? (
                    <span className="aso-announce" style={{ position: "static", transform: "none" }}>
                      {t("war.battle")} · {pileLen}
                    </span>
                  ) : null}
                  {state.table[seat] ? (
                    <BattleCard key={`${state.flips}-m`} card={state.table[seat]!} from="bottom" flight={flight} />
                  ) : (
                    <span style={{ width: 96, height: 134 }} />
                  )}
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={state.turn === seat && !state.done}
                badge={<span className="tnum">{t("war.cards", { n: state.hands[seat]?.length ?? 0 })}</span>}
              >
                <PlayingCard card="?" size="md" />
              </Seat>
            </FeltTable>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <ScorePill label={t("game.you")} value={`${state.hands[seat]?.length ?? 0}`} highlight />
            <ScorePill label={oppName} value={`${state.hands[opp]?.length ?? 0}`} />
            {canFlip ? (
              <Button onClick={() => m.send({ type: "FLIP" })}>{t("war.flip")}</Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Scene>
  );
}
