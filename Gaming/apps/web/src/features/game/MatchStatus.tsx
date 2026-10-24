import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMatchStore } from "../../lib/store";

/**
 * Universal live-match status (mounted once in GameView, so it shows in every
 * game): the per-game turn countdown (with a bar for the full clock) when it's
 * your move, a warning after a timed-out turn (one more and a bot takes the
 * seat), and a banner when an opponent disconnects and the bot takes over.
 */
export function MatchStatus() {
  const { t } = useTranslation();
  const phase = useMatchStore((s) => s.phase);
  const mySeat = useMatchStore((s) => s.seat);
  const turn = useMatchStore((s) => s.turn);
  const turnEndsAt = useMatchStore((s) => s.turnEndsAt);
  const turnMs = useMatchStore((s) => s.turnMs);
  const strikes = useMatchStore((s) => s.timeoutStrikes);
  const substituted = useMatchStore((s) => s.substituted);
  const players = useMatchStore((s) => s.players);
  const disconnected = useMatchStore((s) => s.disconnected);
  const legalCount = useMatchStore((s) => s.legalCount);
  const stateVersion = useMatchStore((s) => s.stateVersion);

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

  // Machine-readable match status (hidden): end-to-end tests and tooling read
  // whose turn it is and whether the server accepted a move from here instead
  // of scraping translated text.
  const probe = (
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

  if (phase !== "playing") return probe;

  const secsLeft = Math.max(0, Math.ceil((turnEndsAt - now) / 1000));
  const share = turnMs > 0 ? Math.min(1, Math.max(0, (turnEndsAt - now) / turnMs)) : 0;
  const warned = strikes > 0 && !substituted.includes(mySeat);
  const droppedOpponents = disconnected.filter((seat) => seat !== mySeat);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-40 flex flex-col items-center gap-2">
      {probe}
      {droppedOpponents.map((seat) => {
        const name = players.find((p) => p.seat === seat)?.displayName ?? t("game.opponent");
        return (
          <div
            key={seat}
            className="rounded-full border border-loss/40 bg-felt-900/90 px-4 py-1.5 text-sm text-ink-100 shadow-lift backdrop-blur"
          >
            ⚠ {t("live.opponentDropped", { name })}
          </div>
        );
      })}

      {/* Opponent's clock: the table isn't hung — someone else is thinking. */}
      {!myTurn && clockRunning && turn !== null && turn !== mySeat ? (
        <div className="rounded-full border border-brass-400/20 bg-felt-900/80 px-4 py-1.5 text-sm text-ink-muted shadow-lift backdrop-blur">
          ⏳ {t("live.opponentTurnTimer", {
            name: players.find((p) => p.seat === turn)?.displayName ?? t("game.opponent"),
            s: secsLeft,
          })}
        </div>
      ) : null}

      {warned ? (
        <div
          role="status"
          className="rounded-full border border-loss/40 bg-felt-900/90 px-4 py-1.5 text-sm text-ink-100 shadow-lift backdrop-blur"
        >
          ⚠ {t("live.timeoutWarning")}
        </div>
      ) : null}

      {myTurn ? (
        <div
          className={`relative overflow-hidden rounded-full px-4 py-1.5 text-sm shadow-lift backdrop-blur ${
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
