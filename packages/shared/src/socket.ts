import type { GameKey } from "./games.js";

/** Realtime socket protocol (§8.3). Payloads are validated with zod server-side. */

export const SOCKET_EVENTS = {
  // client -> server
  QUEUE_JOIN: "queue:join",
  QUEUE_LEAVE: "queue:leave",
  GAME_ACTION: "game:action",
  GAME_RESYNC: "game:resync",
  GAME_RECLAIM: "game:reclaim",
  CHAT_SEND: "chat:send",
  INVITE_SEND: "invite:send",
  INVITE_ACCEPT: "invite:accept",
  // lobby (pre-game room): client -> server
  LOBBY_CREATE: "lobby:create",
  LOBBY_JOIN: "lobby:join",
  LOBBY_LEAVE: "lobby:leave",
  LOBBY_LIST: "lobby:list",
  LOBBY_INVITE: "lobby:invite",
  LOBBY_KICK: "lobby:kick",
  LOBBY_ADD_BOT: "lobby:addBot",
  LOBBY_REMOVE_BOT: "lobby:removeBot",
  LOBBY_SET_TEAM: "lobby:setTeam",
  LOBBY_SET_CONFIG: "lobby:setConfig",
  LOBBY_START: "lobby:start",
  // server -> client
  INVITE_RECEIVED: "invite:received",
  QUEUE_WAITING: "queue:waiting",
  MATCH_FOUND: "match:found",
  GAME_STATE: "game:state",
  GAME_EVENTS: "game:events",
  GAME_OVER: "game:over",
  CHAT_MESSAGE: "chat:message",
  PRESENCE: "game:presence",
  ERROR: "game:error",
  // lobby: server -> client
  LOBBY_STATE: "lobby:state",
  LOBBY_LIST_RESULT: "lobby:listResult",
  LOBBY_CLOSED: "lobby:closed",
  LOBBY_INVITE_RECEIVED: "lobby:inviteReceived",
} as const;

/** Hard cap on a single chat message (server truncates/validates to this). */
export const CHAT_MAX_LEN = 200;

export interface QueueJoinPayload {
  game: GameKey;
  mode?: string;
}

export interface GameActionPayload {
  matchId: string;
  action: unknown; // engine-specific; validated by the authoritative engine
}

export interface ResyncPayload {
  matchId: string;
}

export interface MatchPlayerInfo {
  seat: number;
  displayName: string;
  isBot: boolean;
}

export interface MatchFoundMsg {
  matchId: string;
  game: GameKey;
  seat: number; // the receiving player's seat
  players: MatchPlayerInfo[];
}

export interface GameStateMsg {
  matchId: string;
  state: unknown; // redacted for the receiving seat
  legalActions: unknown[]; // legal actions for the receiving seat (empty if not their turn)
  turn: number | null;
  terminal: boolean;
  /** Epoch ms when the current seat's turn clock expires (server auto-plays). */
  turnEndsAt?: number;
  /** Human seats currently covered by a bot substitute (timed out / dropped). */
  substituted?: number[];
}

/** Server -> client: a seat's live connection status changed. */
export interface PresenceMsg {
  matchId: string;
  seat: number;
  connected: boolean;
}

/** Client -> server: invite a friend to play `game`. */
export interface InviteSendPayload {
  toUserId: string;
  game: GameKey;
}

/** Client -> server: accept an invite from `fromUserId`. */
export interface InviteAcceptPayload {
  fromUserId: string;
  game: GameKey;
}

/** Server -> client: an incoming game invite from a friend. */
export interface InviteReceivedMsg {
  fromUserId: string;
  fromName: string;
  game: GameKey;
}

export interface GameEventsMsg {
  matchId: string;
  events: unknown[];
}

export interface GameScoreLine {
  seat: number;
  result: "win" | "loss" | "draw";
  points?: number;
}

export interface GameOverMsg {
  matchId: string;
  score: GameScoreLine[];
  ratingDeltas: Record<number, number>; // seat -> mmr delta
}

export interface SocketErrorMsg {
  code: string;
  message: string;
}

/** Client -> server: a chat line for the player's current match. */
export interface ChatSendPayload {
  matchId: string;
  text: string;
}

/** Server -> client: a chat line, broadcast to every seat in the match.
 *  `seat` is the sender's seat (-1 for a system line); `system` carries a
 *  localization key the client renders instead of free text. */
export interface ChatMessageMsg {
  matchId: string;
  seat: number;
  displayName: string;
  text: string;
  ts: number;
  system?: string;
}

/* ── lobby (pre-game room) ────────────────────────────────────────────────
 * A lobby exists before a match: the host assembles seats (humans, invited
 * friends, bots), arranges teams, tunes config, then starts — which spins up a
 * GameRoom from the assembled seats. Lobby snapshots are pushed on every change.
 */

export type LobbyVisibility = "public" | "private";

export interface LobbySeat {
  /** Slot index 0..maxSeats-1. Seating order maps to engine seats on start. */
  seat: number;
  userId: string | null; // null = empty slot or bot
  displayName: string;
  isBot: boolean;
  isHost: boolean;
  /** Team id (0-based). For non-team games every seat is its own team. */
  team: number;
  connected: boolean;
}

export interface LobbySnapshot {
  id: string;
  game: GameKey;
  mode: string;
  visibility: LobbyVisibility;
  hostUserId: string;
  seats: LobbySeat[];
  maxSeats: number;
  /** Number of teams (1 = free-for-all). */
  teams: number;
  config: unknown;
  /** True once seating is valid and the host may start. */
  canStart: boolean;
}

/** A public lobby as shown in the browser list. */
export interface LobbyListEntry {
  id: string;
  game: GameKey;
  hostName: string;
  players: number; // occupied seats (humans + bots)
  humans: number;
  maxSeats: number;
}

export interface LobbyCreatePayload {
  game: GameKey;
  mode?: string;
  visibility?: LobbyVisibility;
  config?: unknown;
}
export interface LobbyIdPayload {
  lobbyId: string;
}
export interface LobbyListPayload {
  game?: GameKey;
}
export interface LobbyInvitePayload {
  lobbyId: string;
  toUserId: string;
}
export interface LobbySeatPayload {
  lobbyId: string;
  seat: number;
}
export interface LobbySetTeamPayload {
  lobbyId: string;
  seat: number;
  team: number;
}
export interface LobbySetConfigPayload {
  lobbyId: string;
  config: unknown;
}

export interface LobbyListResultMsg {
  lobbies: LobbyListEntry[];
}
export interface LobbyClosedMsg {
  lobbyId: string;
  reason: string;
}
export interface LobbyInviteReceivedMsg {
  lobbyId: string;
  fromName: string;
  game: GameKey;
}

/** Client -> server: reclaim a seat currently auto-played by a bot substitute. */
export interface ReclaimPayload {
  matchId: string;
}
