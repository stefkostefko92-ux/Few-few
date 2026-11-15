import jwt from "jsonwebtoken";
import { ACCESS_COOKIE, ROLES, SOCKET_EVENTS, type AccessTokenClaims } from "@aso/shared";
import { env } from "./env.js";

/** Parse a Cookie header into a map. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    // A stray "%" makes decodeURIComponent throw URIError — never let a
    // malformed cookie crash the handshake; fall back to the raw value.
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/** Проверени претенции: `exp` е задължителен (unix сек.), за да знаем кога да прекъснем сокета. */
export type VerifiedClaims = AccessTokenClaims & { exp: number; iat?: number };

/**
 * Verify the httpOnly access cookie sent during the Socket.IO handshake (§8.3).
 * Fail-closed: токен без `exp` (вечен), без `sub` или с роля извън ROLES се
 * отхвърля — иначе подписан, но „недовършен“ токен би държал сокета открит завинаги.
 */
export function verifyHandshake(cookieHeader: string | undefined): VerifiedClaims | null {
  const token = parseCookies(cookieHeader)[ACCESS_COOKIE];
  if (!token) return null;
  try {
    const c = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof c !== "object" || c === null) return null;
    const { sub, exp, role } = c as { sub?: unknown; exp?: unknown; role?: unknown };
    if (typeof sub !== "string" || sub.length === 0) return null;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return null;
    return c as VerifiedClaims;
  } catch {
    return null;
  }
}

/** Най-голямото закъснение на setTimeout (над него Node го свежда до 1 ms). */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Резултат от повторната проверка на достъпа (revoked / бан / изтрит). */
export type AccessRecheck = () => Promise<"ok" | "denied">;

/** Колко често се проверява достъпът след изтичане на токена, докато сокетът е жив. */
export const ACCESS_RECHECK_MS = 60_000;

/**
 * В момента на изтичане на токена (`exp`) НЕ прекъсва сокета сляпо — това праща
 * активен играч по пълния offline път (бот-заместник, напускане на лобито).
 * Вместо това повтаря проверката от ръкостискането (`recheck`):
 *  - `ok` → сокетът остава, клиентът получава `auth:reauth` (обновява бисквитката
 *    си) и проверката се повтаря на всеки `recheckMs`;
 *  - `denied` (бан/revoked/изтрит) → прекъсване;
 *  - грешка при проверката → без прекъсване (инфраструктурен срив не изгонва играч),
 *    повторен опит след `recheckMs`.
 * Затворен сокет отменя таймера. Връща функция за отмяна.
 */
export function scheduleExpiryDisconnect(
  socket: {
    disconnect(close?: boolean): unknown;
    emit(ev: string): unknown;
    once(ev: "disconnect", cb: () => void): unknown;
  },
  exp: number,
  recheck: AccessRecheck,
  opts: { now?: number; recheckMs?: number } = {},
): () => void {
  const recheckMs = opts.recheckMs ?? ACCESS_RECHECK_MS;
  let closed = false;
  let timer: ReturnType<typeof setTimeout>;
  const arm = (ms: number): void => {
    timer = setTimeout(() => void tick(), Math.min(Math.max(ms, 0), MAX_TIMER_MS));
    timer.unref?.();
  };
  const tick = async (): Promise<void> => {
    let verdict: "ok" | "denied" | "error";
    try {
      verdict = await recheck();
    } catch {
      verdict = "error";
    }
    if (closed) return;
    if (verdict === "denied") {
      socket.disconnect(true);
      return;
    }
    if (verdict === "ok") socket.emit(SOCKET_EVENTS.AUTH_REAUTH);
    arm(recheckMs);
  };
  arm(exp * 1000 - (opts.now ?? Date.now()));
  const cancel = (): void => {
    closed = true;
    clearTimeout(timer);
  };
  socket.once("disconnect", cancel);
  return cancel;
}
