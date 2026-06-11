import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { Scene } from "../scene/SceneShell";
import { ChipStack, Pot } from "../betting/Chips";
import "../betting/chips.css";

type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
interface HoldemState {
  hole: string[][];
  community: string[];
  chips: number[];
  bet: number[];
  folded: boolean[];
  allIn: boolean[];
  pot: number;
  currentBet: number;
  street: Street;
  turn: number;
  seats: number;
  done: boolean;
}
type HoldemAction =
  | { type: "FOLD" }
  | { type: "CHECK" }
  | { type: "CALL" }
  | { type: "BET" }
  | { type: "RAISE" };

function positionsFor(count: number, mySeat: number): Map<number, SeatPos> {
  const order: SeatPos[] = ["top", "left", "right", "top", "left", "right", "top", "left"];
  const map = new Map<number, SeatPos>();
  let k = 0;
  for (let i = 1; i < count; i++) map.set((mySeat + i) % count, order[k++ % order.length]!);
  return map;
}

export function HoldemView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<HoldemState, HoldemAction>("HOLDEM");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const act = (type: HoldemAction["type"]) => legal.find((a) => a.type === type);

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hole[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  const communityRef = useRef(0);
  useEffect(() => {
    if (state && state.community.length !== communityRef.current) {
      communityRef.current = state.community.length;
      requestAnimationFrame(() => dealIn(".aso-community .aso-card"));
      playCue("flip");
    }
  }, [state, dealIn]);

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <div ref={tableRef}>
            <FeltTable crest="♥" feltColor="#123026" feltDark="#08160f">
              {[...positionsFor(state.seats, seat).entries()].map(([s, pos]) => (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={<ChipStack amount={state.chips[s] ?? 0} size="sm" />}
                >
                  <div style={{ display: "flex", opacity: state.folded[s] ? 0.35 : 1 }}>
                    {(state.folded[s] ? [] : [0, 1]).map((i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -26 : 0 }} />
                    ))}
                  </div>
                </Seat>
              ))}

              {/* Pot + community board in the center. */}
              <div
                style={{
                  position: "absolute",
                  top: "44%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  zIndex: 3,
                }}
              >
                <Pot amount={state.pot} label={t("svara.pot")} />
                <div className="aso-community" style={{ display: "flex", gap: 6 }}>
                  {state.community.map((c) => (
                    <PlayingCard key={c} card={c} size="md" />
                  ))}
                </div>
              </div>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<ChipStack amount={state.chips[seat] ?? 0} size="sm" />}
              >
                <div className="aso-myhand" style={{ display: "flex" }}>
                  {(state.hole[seat] ?? []).map((card, i) => (
                    <PlayingCard key={`${card}-${i}`} card={card} size="md" style={{ marginLeft: i ? -16 : 0 }} />
                  ))}
                </div>
              </Seat>
            </FeltTable>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {act("FOLD") ? (
              <Button variant="ghost" onClick={() => m.send({ type: "FOLD" })} disabled={!myTurn}>
                {t("svara.fold")}
              </Button>
            ) : null}
            {act("CHECK") ? (
              <Button variant="felt" onClick={() => m.send({ type: "CHECK" })} disabled={!myTurn}>
                {t("holdem.check")}
              </Button>
            ) : null}
            {act("CALL") ? (
              <Button variant="felt" onClick={() => m.send({ type: "CALL" })} disabled={!myTurn}>
                {t("svara.call")} ({state.currentBet})
              </Button>
            ) : null}
            {act("BET") ? (
              <Button onClick={() => m.send({ type: "BET" })} disabled={!myTurn}>
                {t("holdem.bet")}
              </Button>
            ) : null}
            {act("RAISE") ? (
              <Button onClick={() => m.send({ type: "RAISE" })} disabled={!myTurn}>
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
