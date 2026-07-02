import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene } from "../scene/SceneShell";
import { ChipStack, Pot } from "../betting/Chips";
import "../betting/chips.css";

interface SvaraState {
  hands: string[][];
  chips: number[];
  bet: number[];
  folded: boolean[];
  pot: number;
  current: number;
  turn: number;
  seats: number;
  done: boolean;
}
type SvaraAction = { type: "CALL" } | { type: "RAISE" } | { type: "FOLD" };

/** Distribute non-self seats around top / sides for up to 6 players. */
function positionsFor(count: number, mySeat: number): Map<number, SeatPos> {
  const order: SeatPos[] = ["top", "left", "right", "top", "left", "right"];
  const map = new Map<number, SeatPos>();
  let k = 0;
  for (let i = 1; i < count; i++) {
    const s = (mySeat + i) % count;
    map.set(s, order[k++ % order.length]!);
  }
  return map;
}

export function SvaraView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<SvaraState, SvaraAction>("SVARA");
  const { state, legal, seat, phase, result, players } = m;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WIN") return { text: ev.seat === seat ? t("fx.youWinPot") : t("fx.winPot"), tone: ev.seat === seat ? "win" : "brass" };
      if (ev.seat === seat) return null;
      if (ev.type === "FOLD") return { text: t("fx.fold"), tone: "brass" };
      if (ev.type === "RAISE") return { text: t("fx.raise"), tone: "loss" };
      return null;
    },
  });

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const call = legal.find((a) => a.type === "CALL");
  const raise = legal.find((a) => a.type === "RAISE");
  const fold = legal.find((a) => a.type === "FOLD");

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <>
          <div ref={tableRef}>
            {/* "Полунощният кръг" — dark, dramatic spotlight (§4.3). */}
            <FeltTable crest="♣" feltColor="#102a20" feltDark="#06120c">
              {[...positionsFor(state.seats, seat).entries()].map(([s, pos]) => (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={<ChipStack amount={state.chips[s] ?? 0} size="sm" />}
                >
                  <div style={{ display: "flex", opacity: state.folded[s] ? 0.35 : 1, transition: "opacity 300ms ease" }}>
                    {Array.from({ length: state.hands[s]?.length ?? 3 }).map((_, i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -26 : 0 }} />
                    ))}
                  </div>
                </Seat>
              ))}

              <TableCenter>
                <Pot amount={state.pot} label={t("svara.pot")} />
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<ChipStack amount={state.chips[seat] ?? 0} size="sm" />}
              >
                <div className="aso-myhand" style={{ display: "flex", opacity: state.folded[seat] ? 0.4 : 1, transition: "opacity 300ms ease" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    <PlayingCard key={`${card}-${i}`} card={card} size="md" style={{ marginLeft: i ? -20 : 0 }} />
                  ))}
                </div>
              </Seat>
            </FeltTable>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {fold ? (
              <Button variant="ghost" onClick={() => m.send(fold)} disabled={!myTurn}>
                {t("svara.fold")}
              </Button>
            ) : null}
            {call ? (
              <Button variant="felt" onClick={() => m.send(call)} disabled={!myTurn}>
                {t("svara.call")} ({state.current})
              </Button>
            ) : null}
            {raise ? (
              <Button onClick={() => m.send(raise)} disabled={!myTurn}>
                {t("svara.raise")}
              </Button>
            ) : null}
          </div>

          <p className="betting-notice">{t("svara.notice")}</p>
        </>
      ) : null}
    </Scene>
  );
}
