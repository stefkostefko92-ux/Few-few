import type { GameKey } from "./games.js";

/** Realtime socket protocol (§8.3). Payloads are validated with zod server-side. */

export const SOCKET_EVENTS = {
  // client -> server
  QUEUE_JOIN: "queue:join",
  QUEUE_LEAVE: "queue:leave",
  GAME_ACTION: "game:action",
  GAME_RESYNC: "game:resync",
  CHAT_SEND: "chat:send",
  // server -> client
  QUEUE_WAITING: "queue:waiting",
  MATCH_FOUND: "match:found",
  GAME_STATE: "game:state",
  GAME_EVENTS: "game:events",
  GAME_OVER: "game:over",
  CHAT_MESSAGE: "chat:message",
  PRESENCE: "game:presence",
  ERROR: "game:error",
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
}

/** Server -> client: a seat's live connection status changed. */
export interface PresenceMsg {
  matchId: string;
  seat: number;
  connected: boolean;
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
