import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import { svaraRaisePresets, type SvaraState as CoreSvaraState } from "@aso/game-core";
import { useAuthStore } from "../../../lib/store";
import { useSettings } from "../../../lib/settings";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { useGameEvents } from "../useGameEvents";
import { useSendOnce } from "../useSendOnce";
import { useRevealOnTurn } from "../useRevealOnTurn";
import { seatNames } from "../seatNames";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene } from "../scene/SceneShell";
import { ChipStack, Pot } from "../betting/Chips";
import "../betting/chips.css";

type SvaraPhase = "BETTING" | "SHOWDOWN" | "SVARA";

interface SvaraState {
  hands: string[][];
  chips: number[];
  bet: number[];
  folded: boolean[];
  pot: number;
  current: number;
  minRaise: number;
  pots: { amount: number; eligible: number[] }[];
  turn: number;
  seats: number;
  dealer: number;
  handNo: number;
  phase: SvaraPhase;
  svaraSeats: number[] | null;
  svaraFee: number;
  winner: number | null;
  done: boolean;
}
type SvaraAction =
  | { type: "CALL" }
  | { type: "RAISE"; to: number }
  | { type: "ALLIN" }
  | { type: "FOLD" }
  | { type: "CONTINUE" }
  | { type: "JOIN" }
  | { type: "SKIP" };

/** Мачът свършва най-късно на тази ръка (= MAX_HANDS_SVARA в game-core). */
const MAX_HANDS = 20;

/** Уникални слотове (в % от масата) за 1–5 опонента — без застъпване при 5–6
 *  играчи. Редът е по часовниковата стрелка от лявата ми страна. */
const OPP_SLOTS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 3 }],
  2: [{ x: 27, y: 4 }, { x: 73, y: 4 }],
  3: [{ x: 14, y: 26 }, { x: 50, y: 3 }, { x: 86, y: 26 }],
  4: [{ x: 12, y: 30 }, { x: 32, y: 3 }, { x: 68, y: 3 }, { x: 88, y: 30 }],
  5: [{ x: 12, y: 32 }, { x: 27, y: 4 }, { x: 50, y: 2 }, { x: 73, y: 4 }, { x: 88, y: 32 }],
};

function opponentSlots(count: number, mySeat: number): { seat: number; x: number; y: number }[] {
  const slots = OPP_SLOTS[Math.min(5, Math.max(1, count - 1))]!;
  const out: { seat: number; x: number; y: number }[] = [];
  for (let i = 1; i < count; i++) {
    const p = slots[Math.min(i - 1, slots.length - 1)]!;
    out.push({ seat: (mySeat + i) % count, x: p.x, y: p.y });
  }
  return out;
}

/** Потът "лети" към седалката на победителя (клонирани чипове в fixed слой). */
function flyPot(scope: HTMLElement | null, winnerSeat: number, mySeat: number): void {
  if (!scope) return;
  const potEl = scope.querySelector<HTMLElement>(".pot");
  const target =
    winnerSeat === mySeat
      ? scope.querySelector<HTMLElement>('.aso-seat[data-pos="bottom"]')
      : scope.querySelector<HTMLElement>(`.svara-seat-slot[data-seat="${winnerSeat}"]`);
  if (!potEl || !target) return;
  const from = potEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:60;pointer-events:none;";
  document.body.appendChild(layer);
  const clones: HTMLElement[] = [];
  for (let i = 0; i < 5; i++) {
    const chip = document.createElement("span");
    chip.className = i % 2 ? "chip chip--red" : "chip chip--brass";
    chip.style.cssText = `position:fixed;left:${from.left + 12 + (i % 3) * 10}px;top:${
      from.top + from.height / 2 - 17 - i * 4
    }px;animation:none;`;
    layer.appendChild(chip);
    clones.push(chip);
  }
  gsap.to(clones, {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    scale: 0.6,
    opacity: 0.1,
    duration: 0.55,
    ease: "power2.in",
    stagger: 0.05,
    onComplete: () => layer.remove(),
  });
}

export function SvaraView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const reduced = useSettings((s) => s.reducedMotion);
  const m = useMatch<SvaraState, SvaraAction>("SVARA");
  const { state, legal, seat, phase, result, players } = m;

  // Three bots share the name „АСО Бот“ — number them so the banners say who.
  const names = useMemo(() => seatNames(players), [players]);
  const nameFor = (s: number) => names(s) ?? `#${s}`;
  // One move per state: a double click on „Плащам“/„Продължи“ sent a second
  // action that the server refused („Невалиден ход“).
  const send = useSendOnce(state, m.send);

  // Opponent-visible action announcements (единни термини: svara.* ключовете).
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "WIN") {
        const pot = typeof ev.pot === "number" ? ev.pot : 0;
        if (typeof ev.potIndex === "number" && ev.potIndex > 0)
          return {
            text: t(ev.split ? "svara.splitsPot" : "svara.winsSidePot", {
              name: ev.seat === seat ? t("game.you") : nameFor(ev.seat as number),
              pot,
            }),
            tone: ev.seat === seat ? "win" : "brass",
          };
        return ev.seat === seat
          ? { text: `${t("fx.youWinPot")} (+${pot})`, tone: "win" }
          : {
              text: t("svara.winsPot", {
                name: nameFor(ev.seat as number),
                pot,
                defaultValue: "{{name}} печели пота ({{pot}})",
              }),
              tone: "brass",
            };
      }
      if (ev.type === "SVARA")
        return {
          text: t("svara.svaraBanner", { pot: ev.pot, defaultValue: "СВАРА! Потът от {{pot}} остава" }),
          tone: "loss",
        };
      if (ev.type === "HAND")
        return { text: t("svara.newHand", { n: ev.handNo, defaultValue: "Ръка {{n}}" }), tone: "brass" };
      if (ev.seat === seat) return null;
      if (ev.type === "ALLIN")
        return {
          text: t("svara.allInBanner", { name: nameFor(ev.seat as number), to: ev.to }),
          tone: "loss",
        };
      if (ev.type === "FOLD")
        return { text: `${nameFor(ev.seat as number)}: ${t("svara.fold")}`, tone: "brass" };
      if (ev.type === "RAISE")
        return {
          text: t("svara.raisesTo", {
            name: nameFor(ev.seat as number),
            to: ev.to,
            defaultValue: "{{name}} вдига на {{to}}",
          }),
          tone: "loss",
        };
      if (ev.type === "JOIN")
        return {
          text: t("svara.joins", {
            name: nameFor(ev.seat as number),
            fee: ev.fee,
            defaultValue: "{{name}} влиза в сварата ({{fee}})",
          }),
          tone: "brass",
        };
      return null;
    },
  });

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);

  // Показваме showdown масата поне ~2.4s дори бот да продължи веднага —
  // иначе разкритите карти изчезват преди човекът да ги е видял.
  const [frozen, setFrozen] = useState<SvaraState | null>(null);
  const unfreezeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state || state.phase !== "SHOWDOWN" || state.done) return;
    setFrozen(state);
    if (unfreezeTimer.current) clearTimeout(unfreezeTimer.current);
    unfreezeTimer.current = setTimeout(() => setFrozen(null), 2400);
  }, [state]);
  useEffect(() => {
    setFrozen(null); // нов мач — без замръзнал showdown от предишния
  }, [m.matchId]);
  useEffect(
    () => () => {
      if (unfreezeTimer.current) clearTimeout(unfreezeTimer.current);
    },
    [],
  );
  const view = frozen ?? state;

  // Раздаването се анимира на ВСЯКА нова ръка (не само първата).
  const lastAnimatedHand = useRef(0);
  useEffect(() => {
    if (!view || view.handNo === lastAnimatedHand.current) return;
    if ((view.hands[seat]?.length ?? 0) === 0) return;
    lastAnimatedHand.current = view.handNo;
    requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
    playCue("deal");
  }, [view, seat, dealIn]);

  // Потът лети към победителя (WIN пристига преди новото състояние).
  useGameEvents(m.matchId, (events) => {
    if (reduced) return;
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number };
      if (ev.type === "WIN" && typeof ev.seat === "number") {
        const winner = ev.seat;
        requestAnimationFrame(() => flyPot(tableRef.current, winner, seat));
      }
    }
  });

  const myTurn = !!state && state.phase === "BETTING" && state.turn === seat && legal.length > 0;
  const call = legal.find((a) => a.type === "CALL");
  const allIn = legal.find((a) => a.type === "ALLIN");
  const fold = legal.find((a) => a.type === "FOLD");
  const cont = legal.find((a) => a.type === "CONTINUE");
  const join = legal.find((a) => a.type === "JOIN");
  const skip = legal.find((a) => a.type === "SKIP");
  const toCall = state ? state.current - (state.bet[seat] ?? 0) : 0;
  const myChips = state?.chips[seat] ?? 0;

  // Вдигане с избор на размер: мин (последното вдигане) … целият стек.
  const presets =
    state && myTurn ? svaraRaisePresets(state as unknown as CoreSvaraState, seat) : null;
  const [raiseTo, setRaiseTo] = useState(0);
  useEffect(() => {
    // Нов ход / ново ниво → плъзгачът се връща на минимума.
    setRaiseTo(presets?.min ?? 0);
  }, [presets?.min, presets?.allIn, state?.handNo]);
  const raiseValue = presets ? Math.min(presets.allIn, Math.max(presets.min, raiseTo)) : 0;
  const sendRaise = () => {
    if (!presets) return;
    // Целият стек = all-in (същото действие, ясно събитие за масата).
    if (raiseValue >= presets.allIn && allIn) send(allIn);
    else send({ type: "RAISE", to: raiseValue });
  };
  const canBet = myTurn && !frozen;
  // The betting bar sits under the table — below the fold on a laptop.
  const actionsRef = useRef<HTMLDivElement>(null);
  useRevealOnTurn(actionsRef, canBet || !!join || !!skip);

  /** Ръката на едно място: реални карти при showdown, гърбове иначе. */
  const seatCards = (s: number, size: "sm" | "md", overlap: number) => {
    const hand = view?.hands[s] ?? [];
    return hand.map((card, i) => (
      <PlayingCard key={`${card}-${i}`} card={card} size={size} style={{ marginLeft: i ? overlap : 0 }} />
    ));
  };

  const betPill = (s: number) => {
    const bet = view?.bet[s] ?? 0;
    if (bet <= 0) return null;
    return (
      <span className="svara-bet tnum">
        <ChipStack amount={bet} size="sm" />
        {bet}
      </span>
    );
  };

  const chipsBadge = (s: number) => {
    const isAllIn =
      view?.phase === "BETTING" && !view.folded[s] && (view.chips[s] ?? 0) === 0;
    return (
      <span className="svara-chips tnum">
        <ChipStack amount={view?.chips[s] ?? 0} size="sm" />
        {view?.chips[s] ?? 0}
        {isAllIn ? <span className="svara-allin">{t("svara.allIn")}</span> : null}
      </span>
    );
  };
  const sidePots = (view?.pots ?? []).filter((p) => p.amount > 0);

  // При showdown "активен" е победителят; иначе — този на ход.
  const seatActive = (s: number) =>
    view?.phase === "SHOWDOWN" ? view.winner === s : view?.turn === s;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state && view ? (
        <>
          <div
            ref={tableRef}
            data-testid="svara-table"
            data-svara-phase={view.phase}
            data-frozen={frozen ? "true" : "false"}
            data-hand-no={view.handNo}
            data-pot={view.pot}
            data-my-chips={myChips}
            data-to-call={toCall}
            data-folded={state.folded[seat] ? "true" : "false"}
          >
            {/* "Полунощният кръг" — dark, dramatic spotlight (§4.3). */}
            <FeltTable crest="♣" feltColor="#102a20" feltDark="#06120c">
              {opponentSlots(view.seats, seat).map(({ seat: s, x, y }) => (
                <div
                  key={s}
                  className="svara-seat-slot"
                  data-seat={s}
                  style={{ "--slot-x": `${x}%`, top: `${y}%` } as CSSProperties}
                >
                  <Seat
                    pos="top"
                    name={nameFor(s)}
                    active={seatActive(s)}
                    badge={chipsBadge(s)}
                  >
                    <div className="svara-seat-stack" style={{ opacity: view.folded[s] ? 0.35 : 1 }}>
                      <div style={{ display: "flex" }}>{seatCards(s, "sm", -26)}</div>
                      {betPill(s)}
                    </div>
                  </Seat>
                </div>
              ))}

              <TableCenter>
                <div className="svara-center">
                  <Pot amount={view.pot} label={t("svara.pot")} />
                  {sidePots.length > 1 ? (
                    <ul className="svara-pots tnum" aria-label={t("svara.pot")}>
                      {sidePots.map((p, i) => (
                        <li key={i}>
                          {i === 0 ? t("svara.mainPot") : t("svara.sidePot", { n: i })}: {p.amount}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <span className="svara-hand-no tnum">
                    {t("svara.handNo", { n: view.handNo, max: MAX_HANDS, defaultValue: "Ръка {{n}}/{{max}}" })}
                  </span>
                  {view.svaraSeats && view.svaraSeats.length > 0 ? (
                    <span className="svara-callout">{t("svara.svara", { defaultValue: "СВАРА!" })}</span>
                  ) : null}
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={seatActive(seat)}
                badge={chipsBadge(seat)}
              >
                <div className="svara-seat-stack" style={{ opacity: view.folded[seat] ? 0.4 : 1 }}>
                  <div className="aso-myhand" style={{ display: "flex" }}>
                    {seatCards(seat, "md", -20)}
                  </div>
                  {betPill(seat)}
                </div>
              </Seat>
            </FeltTable>
          </div>

          <div ref={actionsRef} className="mt-4 flex flex-wrap items-center justify-center gap-3" data-testid="svara-actions">
            {state.phase === "SHOWDOWN" ? (
              <Button
                disabled={!cont}
                data-svara-action="CONTINUE"
                onClick={() => {
                  if (!cont || !send(cont)) return;
                  // Играчът продължи сам — не дръж масата замразена на showdown.
                  if (unfreezeTimer.current) clearTimeout(unfreezeTimer.current);
                  setFrozen(null);
                }}
              >
                {t("svara.continue", { defaultValue: "Продължи" })}
              </Button>
            ) : state.phase === "SVARA" ? (
              join || skip ? (
                <>
                  <Button disabled={!join} data-svara-action="JOIN" onClick={() => join && send(join)}>
                    {t("svara.join", { fee: state.svaraFee, defaultValue: "Влез в сварата ({{fee}})" })}
                  </Button>
                  <Button variant="ghost" disabled={!skip} data-svara-action="SKIP" onClick={() => skip && send(skip)}>
                    {t("svara.skip", { defaultValue: "Оставам извън" })}
                  </Button>
                </>
              ) : (
                <span className="svara-waiting">
                  {t("svara.waitingJoin", { defaultValue: "Свара! Изчакване на решенията…" })}
                </span>
              )
            ) : (
              <>
                {/* Бутоните са винаги видими; извън твоя ход са само disabled.
                    Докато масата показва замразения showdown, не позволяваме
                    залог на сляпо в новата (още невидима) ръка. */}
                <Button
                  variant="ghost"
                  disabled={!canBet || !fold}
                  data-svara-action="FOLD"
                  onClick={() => fold && send(fold)}
                >
                  {t("svara.fold")}
                </Button>
                {/* Без достатъчно чипове за изравняване: all-in „за по-малко“. */}
                {allIn && myChips <= toCall ? (
                  <Button variant="felt" disabled={!canBet} data-svara-action="ALLIN" onClick={() => send(allIn)}>
                    {t("svara.allInAmount", { n: myChips })}
                  </Button>
                ) : (
                  <Button
                    variant="felt"
                    disabled={!canBet || !call}
                    data-svara-action="CALL"
                    onClick={() => call && send(call)}
                  >
                    {toCall > 0
                      ? `${t("svara.call")} (${toCall})`
                      : t("svara.check", { defaultValue: "Чек" })}
                  </Button>
                )}
                {presets ? (
                  <div className="svara-raise" role="group" aria-label={t("svara.raiseSize")}>
                    <div className="svara-raise__presets">
                      {(
                        [
                          ["raiseMin", presets.min],
                          ["raiseHalfPot", presets.halfPot],
                          ["raisePot", presets.pot],
                          ["allIn", presets.allIn],
                        ] as const
                      ).map(([key, v]) => (
                        <button
                          key={key}
                          type="button"
                          className="svara-raise__preset"
                          data-preset={key}
                          data-value={v}
                          aria-pressed={raiseValue === v}
                          disabled={!canBet}
                          onClick={() => setRaiseTo(v)}
                        >
                          {t(`svara.${key}`)}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      className="svara-raise__slider"
                      min={presets.min}
                      max={presets.allIn}
                      step={1}
                      value={raiseValue}
                      disabled={!canBet}
                      aria-label={t("svara.raiseSize")}
                      onChange={(e) => setRaiseTo(Number(e.target.value))}
                    />
                    <Button
                      disabled={!canBet}
                      data-svara-action={raiseValue >= presets.allIn ? "ALLIN" : "RAISE"}
                      data-raise-to={raiseValue}
                      onClick={sendRaise}
                    >
                      {raiseValue >= presets.allIn
                        ? t("svara.allInAmount", { n: myChips })
                        : t("svara.raiseTo", { to: raiseValue })}
                    </Button>
                  </div>
                ) : allIn && myChips > toCall ? (
                  // Къс стек: не стига за минимално вдигане — остава само all-in.
                  <Button disabled={!canBet} data-svara-action="ALLIN" onClick={() => send(allIn)}>
                    {t("svara.allInAmount", { n: myChips })}
                  </Button>
                ) : (
                  <Button disabled>{t("svara.raise")}</Button>
                )}
              </>
            )}
          </div>

          <p className="betting-notice">{t("svara.notice")}</p>
        </>
      ) : null}
    </Scene>
  );
}
