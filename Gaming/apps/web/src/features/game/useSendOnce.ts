import { useCallback, useEffect, useRef } from "react";
import { SOCKET_EVENTS } from "@aso/shared";
import { getSocket } from "../../lib/socket";

/**
 * One move per authoritative state. A double click (or a click racing an
 * automatic move, e.g. War's auto-flip) used to send a SECOND action against
 * the same state: the server rejected it ("Невалиден ход") — or, where it was
 * still legal, applied it twice (Риба: the repeated ASK wasted the turn).
 *
 * `state` is the latest server state object (a fresh object per GAME_STATE),
 * so the lock opens as soon as the server answers. A rejection (`game:error`)
 * also opens it, so the player can try again after a refused move.
 * Returns whether the action was actually sent.
 */
export function useSendOnce<S, A>(state: S | null, send: (action: A) => void): (action: A) => boolean {
  const sentFor = useRef<S | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const unlock = () => {
      sentFor.current = null;
    };
    socket.on(SOCKET_EVENTS.ERROR, unlock);
    return () => {
      socket.off(SOCKET_EVENTS.ERROR, unlock);
    };
  }, []);

  return useCallback(
    (action: A) => {
      if (state !== null && sentFor.current === state) return false;
      sentFor.current = state;
      send(action);
      return true;
    },
    [state, send],
  );
}
