import type { NextRequest } from "next/server";

/**
 * Довереният IP на клиента зад нашия nginx. НЕ ползвай левия елемент на
 * X-Forwarded-For — той е клиентски контролиран (nginx с
 * $proxy_add_x_forwarded_for ДОБАВЯ реалния peer IP след каквото клиентът е
 * пратил, така левият край се подменя свободно). Доверени източници:
 *   1) X-Real-IP — nginx го ПРЕЗАПИСВА с $remote_addr (не се подменя);
 *   2) най-десният X-Forwarded-For hop — добавен от нашия nginx.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").pop()?.trim();
    if (last) return last;
  }
  return "unknown";
}

/**
 * Маха изтеклите записи от rate-limit Map, без да нулира живите броячи
 * (hits.clear() отваряше кратък прозорец, в който всички лимити падат до 0).
 */
export function pruneHits(
  hits: Map<string, number[]>,
  windowMs: number,
  now: number,
): void {
  for (const [key, list] of hits) {
    const live = list.filter((t) => now - t < windowMs);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}
