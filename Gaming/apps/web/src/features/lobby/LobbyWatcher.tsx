import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SOCKET_EVENTS,
  type LobbyClosedMsg,
  type LobbyInviteReceivedMsg,
  type LobbySnapshot,
  type MatchFoundMsg,
} from "@aso/shared";
import { getSocket } from "../../lib/socket";
import { useLobbyStore } from "../../lib/store";
import { lobbyActions } from "./lobbyActions";
import { gameTitle } from "./games";

/**
 * App-wide lobby socket watcher (mounted in Layout). Mirrors LOBBY_STATE into
 * the store, routes the player to the room screen when they enter a lobby,
 * clears the room when it closes or a match starts, and surfaces lobby invites
 * as accept/dismiss toasts.
 */
export function LobbyWatcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [invites, setInvites] = useState<LobbyInviteReceivedMsg[]>([]);

  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const socket = getSocket();

    const onState = (snap: LobbySnapshot) => {
      const had = useLobbyStore.getState().lobby;
      useLobbyStore.getState().setLobby(snap);
      // Don't yank the player off a game view (e.g. the post-match regrouped
      // room arrives while they're reading the verdict) — the game-over panel
      // offers "back to the room" instead.
      if (!had && pathRef.current !== "/rooms" && !pathRef.current.startsWith("/play")) navigate("/rooms");
    };
    const onClosed = (msg: LobbyClosedMsg) => {
      const cur = useLobbyStore.getState().lobby;
      if (cur && cur.id !== msg.lobbyId) return;
      useLobbyStore.getState().setLobby(null);
    };
    const onMatchFound = (_m: MatchFoundMsg) => {
      // The lobby just became a live match — drop the room state.
      useLobbyStore.getState().setLobby(null);
    };
    const onInvite = (msg: LobbyInviteReceivedMsg) => {
      setInvites((prev) => (prev.some((i) => i.lobbyId === msg.lobbyId) ? prev : [...prev, msg]));
    };

    socket.on(SOCKET_EVENTS.LOBBY_STATE, onState);
    socket.on(SOCKET_EVENTS.LOBBY_CLOSED, onClosed);
    socket.on(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);
    socket.on(SOCKET_EVENTS.LOBBY_INVITE_RECEIVED, onInvite);
    return () => {
      socket.off(SOCKET_EVENTS.LOBBY_STATE, onState);
      socket.off(SOCKET_EVENTS.LOBBY_CLOSED, onClosed);
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);
      socket.off(SOCKET_EVENTS.LOBBY_INVITE_RECEIVED, onInvite);
    };
  }, [navigate]);

  function accept(inv: LobbyInviteReceivedMsg) {
    lobbyActions.join(inv.lobbyId);
    setInvites((prev) => prev.filter((i) => i.lobbyId !== inv.lobbyId));
  }
  function dismiss(inv: LobbyInviteReceivedMsg) {
    setInvites((prev) => prev.filter((i) => i.lobbyId !== inv.lobbyId));
  }

  if (invites.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
      {invites.map((inv) => {
        const title = gameTitle(t, inv.game);
        return (
          <div
            key={inv.lobbyId}
            className="flex items-center gap-3 rounded-panel border border-brass-400/30 bg-felt-900/95 px-4 py-3 shadow-lift backdrop-blur"
          >
            <span className="text-sm text-ink-100">
              {t("room.inviteNotif", { name: inv.fromName, game: title })}
            </span>
            <button
              type="button"
              onClick={() => accept(inv)}
              className="rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-3 py-1.5 text-sm font-semibold text-charcoal-900"
            >
              {t("room.inviteJoin")}
            </button>
            <button
              type="button"
              onClick={() => dismiss(inv)}
              aria-label={t("room.inviteDismiss")}
              className="text-ink-muted hover:text-ink-100"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
