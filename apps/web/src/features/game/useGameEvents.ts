import { useEffect, useRef } from "react";
import { SOCKET_EVENTS, type GameEventsMsg } from "@aso/shared";
import { getSocket } from "../../lib/socket";

/**
 * Subscribe to the authoritative engine event stream for one match (TRICK,
 * DECLARATIONS, MARRIAGE, CONTRA, KUPE…). The server emits these to the
 * per-user room right BEFORE the new redacted state, so a handler that reads
 * the DOM synchronously still sees the pre-update table — perfect for trick
 * flights and announce banners. Bound to `matchId` so a stale/foreign match
 * can never drive this view's effects.
 */
export function useGameEvents(matchId: string | null, handler: (events: unknown[]) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!matchId) return;
    const socket = getSocket();
    const onEvents = (msg: GameEventsMsg) => {
      if (msg.matchId !== matchId) return;
      ref.current(msg.events);
    };
    socket.on(SOCKET_EVENTS.GAME_EVENTS, onEvents);
    return () => {
      socket.off(SOCKET_EVENTS.GAME_EVENTS, onEvents);
    };
  }, [matchId]);
}
