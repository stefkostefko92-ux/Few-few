import { SOCKET_EVENTS } from "@aso/shared";
import { getSocket } from "../../lib/socket";
import { useMatchStore } from "../../lib/store";

/**
 * Shown when the local player's seat is being auto-played by a bot substitute
 * (their turn clock expired or they briefly dropped). One tap takes the seat
 * back. Works for every game since it reads the shared match store.
 */
export function ReclaimBanner() {
  const matchId = useMatchStore((s) => s.matchId);
  const seat = useMatchStore((s) => s.seat);
  const substituted = useMatchStore((s) => s.substituted);
  const phase = useMatchStore((s) => s.phase);

  if (!matchId || phase !== "playing" || !substituted.includes(seat)) return null;

  const reclaim = () => getSocket().emit(SOCKET_EVENTS.GAME_RECLAIM, { matchId });

  return (
    <div className="fixed inset-x-0 top-16 z-[55] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-panel border border-brass-400/40 bg-felt-900/95 px-4 py-2.5 shadow-lift backdrop-blur">
        <span className="text-sm text-ink-100">Ботът играе вместо теб.</span>
        <button
          type="button"
          onClick={reclaim}
          className="rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-3 py-1.5 text-sm font-semibold text-charcoal-900"
        >
          Върни се в играта
        </button>
      </div>
    </div>
  );
}
