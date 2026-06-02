import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { SOCKET_EVENTS, type InviteReceivedMsg, type MatchFoundMsg } from "@aso/shared";
import { getSocket } from "../../lib/socket";
import { useMatchStore } from "../../lib/store";
import { GAME_CATALOG } from "../lobby/games";

/**
 * App-wide socket watcher (mounted in Layout). Routes both players into a
 * match created out-of-band (a friend invite) by listening for MATCH_FOUND and
 * navigating to the game; and surfaces incoming invites as accept/dismiss
 * toasts. Normal queue matches already live on the game page, so navigation is
 * a no-op there.
 */
export function InviteWatcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [invites, setInvites] = useState<InviteReceivedMsg[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onFound = (m: MatchFoundMsg) => {
      useMatchStore.getState().setMatch({
        matchId: m.matchId,
        seat: m.seat,
        players: m.players,
        game: m.game,
      });
      const path = `/play/${m.game.toLowerCase()}`;
      if (location.pathname !== path) navigate(path);
    };
    const onInvite = (msg: InviteReceivedMsg) => {
      setInvites((prev) => (prev.some((i) => i.fromUserId === msg.fromUserId) ? prev : [...prev, msg]));
    };

    socket.on(SOCKET_EVENTS.MATCH_FOUND, onFound);
    socket.on(SOCKET_EVENTS.INVITE_RECEIVED, onInvite);
    return () => {
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onFound);
      socket.off(SOCKET_EVENTS.INVITE_RECEIVED, onInvite);
    };
  }, [navigate, location.pathname]);

  function accept(inv: InviteReceivedMsg) {
    getSocket().emit(SOCKET_EVENTS.INVITE_ACCEPT, { fromUserId: inv.fromUserId, game: inv.game });
    setInvites((prev) => prev.filter((i) => i.fromUserId !== inv.fromUserId));
  }
  function dismiss(inv: InviteReceivedMsg) {
    setInvites((prev) => prev.filter((i) => i.fromUserId !== inv.fromUserId));
  }

  if (invites.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
      {invites.map((inv) => {
        const title = GAME_CATALOG.find((g) => g.key === inv.game)?.title ?? inv.game;
        return (
          <div
            key={inv.fromUserId}
            className="flex items-center gap-3 rounded-panel border border-brass-400/30 bg-felt-900/95 px-4 py-3 shadow-lift backdrop-blur"
          >
            <span className="text-sm text-ink-100">
              {t("invite.received", { name: inv.fromName, game: title })}
            </span>
            <button
              type="button"
              onClick={() => accept(inv)}
              className="rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-3 py-1.5 text-sm font-semibold text-charcoal-900"
            >
              {t("invite.accept")}
            </button>
            <button
              type="button"
              onClick={() => dismiss(inv)}
              aria-label={t("common.dismiss")}
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
