import { useMemo, useRef, useState } from "react";
import { useCardFlight } from "../anim/useCardFlight";
import { useGameEvents } from "../useGameEvents";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { useTableFx, Announcements } from "../anim/useTableFx";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useMatch } from "../useMatch";
import { GameOverPanel, SceneHeader, ScorePill, fitOverlap } from "../scene/SceneShell";
import "../cards/cards.css";

interface KentState {
  hands: string[][];
  center: string[];
  deck: string[];
  signaled: boolean[];
  turn: number;
  passStreak: number;
  round: number;
  matchScore: [number, number];
  lastRound: { caller: number; kind: "KUPE" | "STOP"; correct: boolean; winningTeam: number } | null;
}
type KentAction =
  | { type: "SWAP"; handIndex: number; centerIndex: number }
  | { type: "PASS" }
  | { type: "SIGNAL"; seat: number }
  | { type: "CALL_KUPE"; seat: number }
  | { type: "CALL_STOP"; seat: number };

function relativePos(seat: number, mySeat: number): SeatPos {
  const d = (seat - mySeat + 4) % 4;
  return d === 0 ? "bottom" : d === 1 ? "left" : d === 2 ? "top" : "right";
}

export function KentView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<KentState, KentAction>("KENT");
  const { state, legal, seat, phase, result, players } = m;
  const [pickedHand, setPickedHand] = useState<number | null>(null);

  // Всяка валидна смяна (handIndex→centerIndex) от изброените legalActions.
  const swaps = useMemo(() => legal.filter((a) => a.type === "SWAP") as Extract<KentAction, { type: "SWAP" }>[], [legal]);
  const swappableHand = useMemo(() => new Set(swaps.map((a) => a.handIndex)), [swaps]);
  const passAction = legal.find((a) => a.type === "PASS");
  const signalAction = legal.find((a) => a.type === "SIGNAL");
  const kupeAction = legal.find((a) => a.type === "CALL_KUPE");
  const stopAction = legal.find((a) => a.type === "CALL_STOP");

  const tableRef = useRef<HTMLDivElement>(null);
  const flight = useCardFlight(tableRef);
  const myTeamForFx = seat % 2;
  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;
  const { banners } = useTableFx({
    matchId: m.matchId,
    seat,
    scopeRef: tableRef,
    toBanner: (ev) => {
      if (ev.type === "KUPE")
        return {
          text: `${t("kent.callKupe")} ${ev.correct ? "✓" : "✗"}`,
          tone: ev.winningTeam === myTeamForFx ? "win" : "loss",
        };
      if (ev.type === "STOP_KENT")
        return {
          text: `${t("kent.callStop")} ${ev.correct ? "✓" : "✗"}`,
          tone: ev.winningTeam === myTeamForFx ? "win" : "loss",
        };
      if (ev.type === "ROUND" && typeof ev.winningTeam === "number")
        return {
          text: t("kent.roundWon", { team: ev.winningTeam === myTeamForFx ? t("belote.yourTeam") : t("belote.theirTeam") }),
          tone: ev.winningTeam === myTeamForFx ? "win" : "loss",
        };
      if (ev.type === "REPLACE" || ev.type === "REDEAL") return { text: t("belote.redeal"), tone: "brass" };
      return null;
    },
  });

  // Смяна на карта: своята карта „отлита" към центъра.
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string };
      if (ev.type === "SWAP" || ev.type === "REPLACE") playCue("flip");
    }
  });

  if (!state) {
    return (
      <div className="mx-auto max-w-md text-center">
        <SceneHeader title={title} />
        {phase === "over" && result ? (
          <GameOverPanel seat={seat} result={result} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-panel border border-brass-400/15 bg-felt-800/80 px-10 py-12">
            <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
            <p className="text-ink-300">{t("game.searching")}</p>
          </div>
        )}
      </div>
    );
  }

  const myTeam = seat % 2;
  const partner = (seat + 2) % 4;
  const myHand = state.hands[seat] ?? [];
  const myTurn = state.turn === seat && legal.length > 0;
  const partnerSignaled = state.signaled[partner];
  const myKent = myHand.length === 4 && myHand.every((c) => c[0] === myHand[0]![0]);

  const doSwap = (centerIndex: number, el: HTMLElement | null) => {
    if (pickedHand === null) return;
    playCue("flip");
    flight.flyGhost(el, "top");
    m.send({ type: "SWAP", handIndex: pickedHand, centerIndex });
    setPickedHand(null);
  };

  return (
    <div className="mx-auto w-full max-w-[min(94vw,1240px)]">
      <SceneHeader title={title} />

      <div ref={tableRef} style={{ position: "relative" }}>
        <Announcements banners={banners} />
        <FeltTable crest="♤">
          {[0, 1, 2, 3]
            .filter((s) => s !== seat)
            .map((s) => (
              <Seat
                key={s}
                pos={relativePos(s, seat)}
                name={`${nameFor(s)}${s === partner ? " ★" : ""}`}
                active={state.turn === s}
                badge={<TeamDot team={s % 2} myTeam={myTeam} />}
              >
                <div style={{ display: "flex" }}>
                  {Array.from({ length: state.hands[s]?.length ?? 4 }).map((_, i) => (
                    <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -22 : 0 }} />
                  ))}
                </div>
                {/* Тайният знак на партньора — виждаш го само ти. */}
                {s === partner && partnerSignaled ? (
                  <div className="mt-1 text-center text-xs font-bold text-brass-300">👁 {t("kent.signaled")}</div>
                ) : null}
              </Seat>
            ))}

          <TableCenter>
            <div className="text-center">
              <div className="text-xs text-ink-muted">{t("kent.center")}</div>
              <div className="mt-1 flex justify-center">
                {state.center.map((card, i) => {
                  const canTake = myTurn && pickedHand !== null;
                  const slot: { el: HTMLElement | null } = { el: null };
                  return (
                    <div
                      key={`${card}-${i}`}
                      ref={(el) => {
                        slot.el = el;
                      }}
                      style={{ marginLeft: i ? -16 : 0 }}
                    >
                      <PlayingCard
                        card={card}
                        size="sm"
                        dimmed={!canTake}
                        onClick={canTake ? () => doSwap(i, slot.el) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-ink-muted">
                {t("kent.round")} {state.round} · {t("kent.deckLeft")}: {state.deck.length}
              </div>
              <div className="mt-1 text-xs text-ink-300">
                {myTurn
                  ? pickedHand === null
                    ? t("kent.pickHandCard")
                    : t("kent.pickCenterCard")
                  : t("kent.waiting")}
              </div>
            </div>
          </TableCenter>

          <Seat
            pos="bottom"
            name={user?.displayName ?? t("game.you")}
            active={myTurn}
            badge={<TeamDot team={myTeam} myTeam={myTeam} />}
          >
            <div className="aso-myhand" style={{ display: "flex" }}>
              {myHand.map((card, i) => {
                const canPick = myTurn && swappableHand.has(i);
                return (
                  <div key={`${card}-${i}`} style={{ marginLeft: i ? -fitOverlap(myHand.length, "md") : 0 }}>
                    <PlayingCard
                      card={card}
                      size="md"
                      selected={pickedHand === i}
                      dimmed={!canPick}
                      onClick={canPick ? () => setPickedHand(pickedHand === i ? null : i) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </Seat>
        </FeltTable>
      </div>

      {/* Каре банер + действия */}
      {myKent ? (
        <p className="mt-3 text-center text-sm font-bold text-brass-300">🂡 {t("kent.youHaveKent")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {passAction ? (
          <Button variant="felt" onClick={() => { playCue("flip"); m.send(passAction); setPickedHand(null); }}>
            {t("kent.pass")}
          </Button>
        ) : null}
        {signalAction ? (
          <Button variant="ghost" onClick={() => { playCue("flip"); m.send(signalAction); }}>
            👁 {t("kent.signal")}
          </Button>
        ) : null}
        {kupeAction ? (
          <Button onClick={() => { playCue("deal"); m.send(kupeAction); }}>{t("kent.callKupe")}</Button>
        ) : null}
        {stopAction ? (
          <Button variant="ghost" onClick={() => { playCue("deal"); m.send(stopAction); }}>
            ✋ {t("kent.callStop")}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <ScorePill label={t("belote.yourTeam")} value={state.matchScore[myTeam] ?? 0} highlight />
        <ScorePill label={t("belote.theirTeam")} value={state.matchScore[myTeam === 0 ? 1 : 0] ?? 0} />
        <span className="text-xs text-ink-muted">{t("kent.target")} {3}</span>
      </div>

      {state.lastRound ? (
        <p className="mt-2 text-center text-xs text-ink-muted">
          {(state.lastRound.kind === "KUPE" ? t("kent.callKupe") : t("kent.callStop"))}: {nameFor(state.lastRound.caller)} —{" "}
          {state.lastRound.correct ? t("kent.correct") : t("kent.wrong")}
        </p>
      ) : null}

      {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : null}
    </div>
  );
}

function TeamDot({ team, myTeam }: { team: number; myTeam: number }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: team === myTeam ? "var(--win)" : "var(--loss)",
        display: "inline-block",
      }}
    />
  );
}
