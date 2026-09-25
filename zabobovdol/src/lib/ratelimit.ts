import "server-only";
import { headers } from "next/headers";
import { createRateLimiter } from "./ratelimit-core";

// Прост лимит на заявки в паметта (за единичен сървър/контейнер).
// Пази публичните форми от наводняване с ботове/спам. Логиката (чистене по
// време, прозорец на запис) е в ./ratelimit-core.ts, за да може да се тества.
const limiter = createRateLimiter();

/** true = разрешено, false = блокирано. */
export function rateLimit(
  key: string,
  max = 6,
  windowMs = 10 * 60 * 1000,
): boolean {
  return limiter.hit(key, max, windowMs);
}

// Ключ по IP на посетителя (за server actions).
//
// Зад един обратен прокси (Nginx, както е в продукцията) клиентът може сам да
// подаде `X-Forwarded-For`, а проксито ДОБАВЯ реалния IP в КРАЯ на веригата.
// Затова не вярваме на първия (подаваем) запис, а ползваме `X-Real-IP` (зададен
// от проксито) или ПОСЛЕДНИЯ hop от XFF. (Предполага се точно един доверен
// прокси пред приложението.)
export async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip =
    h.get("x-real-ip")?.trim() || xff[xff.length - 1] || "unknown";
  return `${prefix}:${ip}`;
}

export const RATE_LIMIT_MESSAGE =
  "Получихме няколко заявки от вас. Моля, опитайте отново след малко.";
