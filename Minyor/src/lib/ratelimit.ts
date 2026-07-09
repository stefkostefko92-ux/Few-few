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

// Ключ по IP на посетителя (за server actions).
// Зад обратен прокси (Nginx задава `X-Real-IP` = реалния отдалечен адрес)
// предпочитаме него; иначе вземаме НАЙ-ДЕСНИЯ запис от `X-Forwarded-For`
// (добавен от доверения прокси), а не най-левия, който клиентът може да подмени.
export async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = h.get("x-real-ip")?.trim() || xff[xff.length - 1] || "unknown";
  return `${prefix}:${ip}`;
}

export const RATE_LIMIT_MESSAGE =
  "Получихме няколко заявки от вас. Моля, опитайте отново след малко.";
