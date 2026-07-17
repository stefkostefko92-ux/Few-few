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
import "./war.css";

interface WarState {
  hands: string[][];
  pile: string[];
  table: [string | null, string | null];
  turn: number;
  phase: "FLIP" | "WAR";
  flips: number;
  streak: { seat: number; count: number } | null;
  bounty: number;
  winner: number | null;
  done: boolean;
}
type WarAction = { type: "FLIP" } | { type: "FIGHT" } | { type: "SKIRMISH" };

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

  const { banners, announce } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WAR") return { text: t("war.warPhase"), tone: "brass" };
      if (ev.type === "RAID") return { text: t("war.raid"), tone: "brass" };
      return null;
    },
  });

  const opp = seat === 0 ? 1 : 0;
  const inWar = legal.some((a) => a.type === "FIGHT");
  const canFlip = legal.some((a) => a.type === "FLIP");
  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  // TAKE: fly the contested cards to the winner; RAID: celebrate the steal.
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; count?: number };
      if (ev.type === "TAKE" && typeof ev.seat === "number") {
        const nodes = tableRef.current?.querySelectorAll<HTMLElement>(".aso-trick-card") ?? [];
        flight.collect(nodes, ev.seat === seat ? "bottom" : "top", { delayMs: 420 });
        if ((ev.count ?? 0) > 3)
          announce(
            t("war.tookPile", { name: ev.seat === seat ? t("game.you") : oppName, n: ev.count }),
            ev.seat === seat ? "win" : "loss",
          );
      }
      if (ev.type === "RAID" && typeof ev.seat === "number") {
        playCue(ev.seat === seat ? "win" : "loss");
        announce(t("war.raided", { name: ev.seat === seat ? t("game.you") : oppName }), ev.seat === seat ? "win" : "loss");
      }
    }
  });

  // Auto-flip during the FLIP phase only (paces the duel). War DECISIONS
  // (FIGHT/SKIRMISH) are the player's to make — never auto-resolved.
  const myFlip = canFlip && !inWar;
  useEffect(() => {
    if (myFlip && state && !state.done) {
      const id = setTimeout(() => {
        playCue("flip");
        send({ type: "FLIP" });
      }, 900);
      return () => clearTimeout(id);
    }
  }, [myFlip, state, send]);

  const bounty = state?.bounty || state?.pile.length || 0;
  const myStreak = state?.streak && state.streak.seat === seat ? state.streak.count : 0;
  const oppStreak = state?.streak && state.streak.seat === opp ? state.streak.count : 0;

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
                badge={
                  <span className="tnum">
                    {t("war.cards", { n: state.hands[opp]?.length ?? 0 })}
                    {oppStreak >= 2 ? <span className="war-streak"> 🔥{oppStreak}</span> : null}
                  </span>
                }
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
                  {bounty > 2 || state.phase === "WAR" ? (
                    <div className={`war-bounty${state.phase === "WAR" ? " war-bounty--hot" : ""}`}>
                      <span className="war-bounty__label">
                        {state.phase === "WAR" ? t("war.warPhase") : t("war.battle")}
                      </span>
                      <span className="war-bounty__count tnum">{t("war.bounty", { n: bounty })}</span>
                    </div>
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
                badge={
                  <span className="tnum">
                    {t("war.cards", { n: state.hands[seat]?.length ?? 0 })}
                    {myStreak >= 2 ? <span className="war-streak"> 🔥{myStreak}</span> : null}
                  </span>
                }
              >
                <PlayingCard card="?" size="md" />
              </Seat>
            </FeltTable>
          </div>

          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3">
              <ScorePill label={t("game.you")} value={`${state.hands[seat]?.length ?? 0}`} highlight />
              <ScorePill label={oppName} value={`${state.hands[opp]?.length ?? 0}`} />
            </div>
            {inWar ? (
              <>
                <p className="text-center text-sm text-ink-muted">{t("war.fightHint")}</p>
                <div className="flex items-center justify-center gap-3">
                  <Button className="war-cta" onClick={() => send({ type: "FIGHT" })}>
                    ⚔ {t("war.fight")}
                  </Button>
                  <Button variant="felt" onClick={() => send({ type: "SKIRMISH" })}>
                    {t("war.skirmish")}
                  </Button>
                </div>
              </>
            ) : canFlip ? (
              <Button onClick={() => send({ type: "FLIP" })}>{t("war.flip")}</Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Scene>
  );
}
