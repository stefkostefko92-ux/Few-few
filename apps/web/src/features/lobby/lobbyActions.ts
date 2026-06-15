import { SOCKET_EVENTS, type GameKey, type LobbyVisibility } from "@aso/shared";
import { getSocket } from "../../lib/socket";

/** Thin emit helpers for the pre-game lobby protocol. */
export const lobbyActions = {
  create(game: GameKey, visibility: LobbyVisibility, config?: unknown, mode = "custom") {
    getSocket().emit(SOCKET_EVENTS.LOBBY_CREATE, { game, visibility, config, mode });
  },
  join(lobbyId: string) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_JOIN, { lobbyId });
  },
  leave() {
    getSocket().emit(SOCKET_EVENTS.LOBBY_LEAVE, {});
  },
  list(game?: GameKey) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_LIST, game ? { game } : {});
  },
  invite(lobbyId: string, toUserId: string) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_INVITE, { lobbyId, toUserId });
  },
  kick(lobbyId: string, seat: number) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_KICK, { lobbyId, seat });
  },
  addBot(lobbyId: string) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_ADD_BOT, { lobbyId });
  },
  removeBot(lobbyId: string, seat: number) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_REMOVE_BOT, { lobbyId, seat });
  },
  setTeam(lobbyId: string, seat: number, team: number) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_SET_TEAM, { lobbyId, seat, team });
  },
  setConfig(lobbyId: string, config: unknown) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_SET_CONFIG, { lobbyId, config });
  },
  start(lobbyId: string) {
    getSocket().emit(SOCKET_EVENTS.LOBBY_START, { lobbyId });
  },
};
