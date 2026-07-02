import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";

interface WarState {
  hands: string[][];
  pile: string[];
  table: [string | null, string | null];
  turn: number;
  winner: number | null;
  done: boolean;
}
type WarAction = { type: "FLIP" };

export function WarView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<WarState, WarAction>("WAR");
  const { state, legal, seat, phase, result, players, send } = m;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WAR") return { text: t("fx.war"), tone: "brass" };
      return null;
    },
  });

  const opp = seat === 0 ? 1 : 0;
  const canFlip = legal.some((a) => a.type === "FLIP");
  const oppName = players.find((p) => p.seat === opp)?.displayName ?? t("game.opponent");

  // Auto-flip with a small delay so the duel reads as a rhythm (War has no
  // decisions — FLIP is the only move; we pace it for drama, §4.4).
  const pileLen = state?.pile.length ?? 0;
  useEffect(() => {
    if (canFlip && state && !state.done) {
      const id = setTimeout(() => {
        playCue(pileLen > 2 ? "loss" : "flip");
        send({ type: "FLIP" });
      }, 900);
      return () => clearTimeout(id);
    }
  }, [canFlip, state, pileLen, send]);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <>
          <FeltTable crest="⚔" feltColor="#2a1530" feltDark="#120817">
            <Seat
              pos="top"
              name={oppName}
              active={!canFlip && !state.done}
              badge={<span className="tnum">{t("war.cards", { n: state.hands[opp]?.length ?? 0 })}</span>}
            >
              <PlayingCard card="?" size="md" />
            </Seat>

            <TableCenter>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                {/* keyed by card+pile so each flip remounts → deal-in animation */}
                <PlayingCard key={`${state.table[opp] ?? "?"}-${pileLen}`} card={state.table[opp] ?? "?"} size="lg" />
                {pileLen > 2 ? (
                  <span className="aso-announce" style={{ position: "static", transform: "none" }}>
                    {t("war.battle")} · {pileLen}
                  </span>
                ) : null}
                <PlayingCard key={`${state.table[seat] ?? "?"}-${pileLen}`} card={state.table[seat] ?? "?"} size="lg" />
              </div>
            </TableCenter>

            <Seat
              pos="bottom"
              name={user?.displayName ?? t("game.you")}
              active={canFlip}
              badge={<span className="tnum">{t("war.cards", { n: state.hands[seat]?.length ?? 0 })}</span>}
            >
              <PlayingCard card="?" size="md" />
            </Seat>
          </FeltTable>

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
