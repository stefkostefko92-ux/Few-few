import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SOCKET_EVENTS } from "@aso/shared";
import { getSocket } from "../../lib/socket";
import { useMatchStore } from "../../lib/store";

/**
 * Hidden, machine-readable match status (mounted once in GameView, so it is
 * present in every game): end-to-end tests and tooling read whose turn it is
 * and whether the server accepted a move from here instead of scraping
 * translated text. The visible live status is `MatchPills` in the scene header.
 */
export function MatchStatus() {
  const phase = useMatchStore((s) => s.phase);
  const mySeat = useMatchStore((s) => s.seat);
  const turn = useMatchStore((s) => s.turn);
  const substituted = useMatchStore((s) => s.substituted);
  const legalCount = useMatchStore((s) => s.legalCount);
  const stateVersion = useMatchStore((s) => s.stateVersion);
  return (
    <output
      hidden
      data-testid="match-probe"
      data-phase={phase}
      data-seat={mySeat}
      data-turn={turn ?? ""}
      data-my-turn={phase === "playing" && turn === mySeat ? "true" : "false"}
      data-legal={legalCount}
      data-version={stateVersion}
      data-substituted={substituted.includes(mySeat) ? "true" : "false"}
    />
  );
}

const PILL = "rounded-full px-3.5 py-1 text-sm shadow-lift backdrop-blur";

/**
 * Live match status, shown IN the scene header (every game renders
 * SceneHeader): your turn countdown (with a bar for the full clock), the
 * opponent's clock, the warning after a timed-out turn, „the bot is playing for
 * you — take your seat back“, and a note when an opponent drops.
 *
 * It used to float over the top of the table and covered exactly what sits
 * there — the opponents' name plates and scores — for the whole match.
 */
export function MatchPills() {
  const { t } = useTranslation();
  const phase = useMatchStore((s) => s.phase);
  const matchId = useMatchStore((s) => s.matchId);
  const mySeat = useMatchStore((s) => s.seat);
  const turn = useMatchStore((s) => s.turn);
  const turnEndsAt = useMatchStore((s) => s.turnEndsAt);
  const turnMs = useMatchStore((s) => s.turnMs);
  const strikes = useMatchStore((s) => s.timeoutStrikes);
  const substituted = useMatchStore((s) => s.substituted);
  const players = useMatchStore((s) => s.players);
  const disconnected = useMatchStore((s) => s.disconnected);

  const [now, setNow] = useState(() => Date.now());
  const myTurn = phase === "playing" && turn === mySeat && turnEndsAt > 0;
  const clockRunning = phase === "playing" && turnEndsAt > 0;

  // Tick while any turn clock runs (yours or the opponent's); reset `now`
  // immediately so the first frame doesn't show a stale value.
  useEffect(() => {
    if (!clockRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [clockRunning]);

  if (phase !== "playing") return null;

  const secsLeft = Math.max(0, Math.ceil((turnEndsAt - now) / 1000));
  const share = turnMs > 0 ? Math.min(1, Math.max(0, (turnEndsAt - now) / turnMs)) : 0;
  const botForMe = matchId !== null && substituted.includes(mySeat);
  const warned = strikes > 0 && !botForMe;
  const droppedOpponents = disconnected.filter((seat) => seat !== mySeat);
  const nameOf = (seat: number) => players.find((p) => p.seat === seat)?.displayName ?? t("game.opponent");

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="match-pills">
      {botForMe ? (
        <div className={`${PILL} flex items-center gap-2 border border-brass-400/40 bg-felt-900/90 !pr-1 text-ink-100`}>
          <span>{t("game.botPlaying")}</span>
          <button
            type="button"
            onClick={() => getSocket().emit(SOCKET_EVENTS.GAME_RECLAIM, { matchId })}
            className="rounded-full bg-gradient-to-b from-brass-300 to-brass-400 px-3 py-0.5 text-sm font-semibold text-charcoal-900"
          >
            {t("game.reclaim")}
          </button>
        </div>
      ) : null}

      {droppedOpponents.map((seat) => (
        <div key={seat} className={`${PILL} border border-loss/40 bg-felt-900/90 text-ink-100`}>
          ⚠ {t("live.opponentDropped", { name: nameOf(seat) })}
        </div>
      ))}

      {/* Opponent's clock: the table isn't hung — someone else is thinking. */}
      {!myTurn && clockRunning && turn !== null && turn !== mySeat ? (
        <div className={`${PILL} border border-brass-400/20 bg-felt-900/80 text-ink-muted`}>
          ⏳ {t("live.opponentTurnTimer", { name: nameOf(turn), s: secsLeft })}
        </div>
      ) : null}

      {warned ? (
        <div role="status" className={`${PILL} border border-loss/40 bg-felt-900/90 text-ink-100`}>
          ⚠ {t("live.timeoutWarning")}
        </div>
      ) : null}

      {myTurn ? (
        <div
          className={`relative overflow-hidden ${PILL} ${
            secsLeft <= 5
              ? "bg-loss font-semibold text-white"
              : secsLeft <= 10
                ? "border border-brass-400/30 bg-felt-900/90 font-semibold text-brass-300"
                : "border border-brass-400/20 bg-felt-900/80 text-ink-100"
          }`}
          aria-live={secsLeft <= 10 ? "polite" : "off"}
        >
          ⏱ {t("live.yourTurnTimer", { s: secsLeft })}
          {share > 0 ? (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brass-300/70 transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `scaleX(${share})` }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
