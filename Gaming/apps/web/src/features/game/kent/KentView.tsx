import { useMemo, useRef } from "react";
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
  pending: (string | null)[];
  signaled: boolean[];
  turn: number;
  passes: number;
  round: number;
  matchScore: [number, number];
  lastRound: { caller: number; correct: boolean; winningTeam: number } | null;
}
type KentAction =
  | { type: "PASS"; card: string }
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

  const passMap = useMemo(
    () => new Map(legal.filter((a) => a.type === "PASS").map((a) => [(a as { card: string }).card, a])),
    [legal],
  );
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
      if (ev.type === "REDEAL") return { text: t("belote.redeal"), tone: "brass" };
      return null;
    },
  });

  // The simultaneous SWAP: four face-down cards visibly slide to the left
  // neighbour (the whole point of the round — it was a teleport before).
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string };
      if (ev.type === "SWAP") {
        playCue("flip");
        const order: SeatPos[] = ["bottom", "left", "top", "right"];
        order.forEach((from, i) => flight.flyGhost(from, order[(i + 1) % 4]!));
      }
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
  const myTurn = state.turn === seat && passMap.size > 0;
  const iPassed = state.pending[seat] !== null;
  const partnerSignaled = state.signaled[partner];
  const myKent = myHand.length === 4 && myHand.every((c) => c.slice(-1) && c[0] === myHand[0]![0]);

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
              {/* Partner's secret signal — visible only to you. */}
              {s === partner && partnerSignaled ? (
                <div className="mt-1 text-center text-xs font-bold text-brass-300">👁 {t("kent.signaled")}</div>
              ) : null}
              {state.pending[s] !== null ? (
                <div className="mt-1 text-center text-[11px] text-ink-muted">{t("kent.chosen")}</div>
              ) : null}
            </Seat>
          ))}

        <TableCenter>
          <div className="text-center">
            <div className="text-sm text-ink-muted">
              {t("kent.round")} {state.round} · {t("kent.passes")}: {state.passes}
            </div>
            <div className="mt-1 text-xs text-ink-300">
              {myTurn ? t("kent.yourPass") : iPassed ? t("kent.waiting") : t("kent.pickToPass")}
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
              const action = passMap.get(card);
              const canPass = myTurn && !!action && !iPassed;
              const slot: { el: HTMLElement | null } = { el: null };
              return (
                <div
                  key={`${card}-${i}`}
                  ref={(el) => {
                    slot.el = el;
                  }}
                  style={{ marginLeft: i ? -fitOverlap(myHand.length, "md") : 0 }}
                >
                  <PlayingCard
                    card={card}
                    size="md"
                    dimmed={!canPass}
                    onClick={
                      canPass
                        ? () => {
                            playCue("flip");
                            flight.flyGhost(slot.el, "left");
                            m.send(action);
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </Seat>
        </FeltTable>
      </div>

      {/* Kent banner + actions */}
      {myKent ? (
        <p className="mt-3 text-center text-sm font-bold text-brass-300">🂡 {t("kent.youHaveKent")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {signalAction ? (
          <Button variant="ghost" onClick={() => { playCue("flip"); m.send(signalAction); }}>
            👁 {t("kent.signal")}
          </Button>
        ) : null}
        {kupeAction ? (
          <Button onClick={() => { playCue("deal"); m.send(kupeAction); }}>{t("kent.callKupe")}</Button>
        ) : null}
        {stopAction ? (
          <Button variant="felt" onClick={() => { playCue("deal"); m.send(stopAction); }}>
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
          {t("kent.lastCall")}: {nameFor(state.lastRound.caller)} —{" "}
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
