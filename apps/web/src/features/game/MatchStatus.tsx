import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMatchStore } from "../../lib/store";

/**
 * Universal live-match status (mounted once in GameView, so it shows in every
 * game): a turn countdown when it's your move and a banner when an opponent
 * disconnects and the bot takes over.
 */
export function MatchStatus() {
  const { t } = useTranslation();
  const phase = useMatchStore((s) => s.phase);
  const mySeat = useMatchStore((s) => s.seat);
  const turn = useMatchStore((s) => s.turn);
  const turnEndsAt = useMatchStore((s) => s.turnEndsAt);
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
  const droppedOpponents = disconnected.filter((seat) => seat !== mySeat);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex flex-col items-center gap-2">
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

      {myTurn && secsLeft <= 15 ? (
        <div
          className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-lift backdrop-blur ${
            secsLeft <= 5 ? "bg-loss text-white" : "bg-felt-900/90 text-brass-300 border border-brass-400/30"
          }`}
        >
          ⏱ {t("live.yourTurnTimer", { s: secsLeft })}
        </div>
      ) : null}
    </div>
  );
}
