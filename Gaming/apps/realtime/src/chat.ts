import type { Socket } from "socket.io";
import { CHAT_MAX_LEN } from "@aso/shared";

/**
 * In-match chat moderation. Server-authoritative: every line is length-capped,
 * stripped of control characters, collapsed, and profanity-masked before it is
 * broadcast. A per-socket sliding window throttles spam. Client-side muting of
 * an opponent is layered on top of this for the receiving player.
 */

// Modest Bulgarian + English profanity set. Matched case-insensitively as
// stems; the inner characters are masked so the intent is dampened without
// dropping the whole message.
const PROFANITY = [
  "мамка",
  "копеле",
  "путк",
  "кур",
  "пед",
  "шибан",
  "идиот",
  "тъп",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "bastard",
];

const PROFANITY_RE = new RegExp(`(${PROFANITY.join("|")})`, "giu");

function mask(word: string): string {
  if (word.length <= 2) return "●".repeat(word.length);
  return word[0] + "●".repeat(word.length - 1);
}

/**
 * Normalize and moderate a raw chat line. Returns the cleaned text, or null if
 * nothing printable remains.
 */
export function sanitizeChat(raw: string): string | null {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ") // strip control chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LEN);
  if (!cleaned) return null;
  return cleaned.replace(PROFANITY_RE, (m) => mask(m));
}

interface ChatRateState {
  times: number[];
}

const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 8; // burst allowance
const MIN_GAP_MS = 500; // anti-flood between consecutive lines

/**
 * Sliding-window rate limit per socket. Mutates state stored on the socket so
 * it lives exactly as long as the connection.
 */
export function chatRateOk(socket: Socket): boolean {
  const data = socket.data as { chat?: ChatRateState };
  data.chat ??= { times: [] };
  const now = Date.now();
  const recent = data.chat.times.filter((t) => now - t < WINDOW_MS);

  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < MIN_GAP_MS) return false;
  if (recent.length >= MAX_IN_WINDOW) return false;

  recent.push(now);
  data.chat.times = recent;
  return true;
}

/**
 * Generic per-socket sliding-window limiter for non-chat events (game actions,
 * queue joins, invites). State lives on the socket, so it's freed on disconnect
 * and is per-connection. Returns false when the caller should drop the event.
 */
export function socketRateOk(socket: Socket, bucket: string, max: number, windowMs: number): boolean {
  const data = socket.data as { rate?: Record<string, number[]> };
  data.rate ??= {};
  const now = Date.now();
  const recent = (data.rate[bucket] ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    data.rate[bucket] = recent;
    return false;
  }
  recent.push(now);
  data.rate[bucket] = recent;
  return true;
}
