import "server-only";
import { headers } from "next/headers";

// Прост лимит на заявки в паметта (за единичен сървър/контейнер).
// Пази публичните форми от наводняване с ботове/спам.
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  max = 6,
  windowMs = 10 * 60 * 1000,
): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false; // блокирано
  }
  arr.push(now);
  hits.set(key, arr);
  // лека хигиена на паметта
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t > windowMs)) hits.delete(k);
    }
  }
  return true; // разрешено
}

// IP на посетителя.
//
// Зад един обратен прокси (Nginx, както е в продукцията) клиентът може сам да
// подаде `X-Forwarded-For`, а проксито ДОБАВЯ реалния IP в КРАЯ на веригата.
// Затова не вярваме на първия (подаваем) запис, а ползваме `X-Real-IP` (зададен
// от проксито) или ПОСЛЕДНИЯ hop от XFF. (Предполага се точно един доверен
// прокси пред приложението.)
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return h.get("x-real-ip")?.trim() || xff[xff.length - 1] || "unknown";
}

// Ключ по IP на посетителя (за server actions / rate-limit).
export async function clientKey(prefix: string): Promise<string> {
  return `${prefix}:${await clientIp()}`;
}

export const RATE_LIMIT_MESSAGE =
  "Получихме няколко заявки от вас. Моля, опитайте отново след малко.";
