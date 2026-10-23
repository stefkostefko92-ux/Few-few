import 'server-only';
import { headers } from 'next/headers';

// Лек ограничител на заявките за публичните форми и входа (одит M7/L3).
// В паметта на процеса — приложението върви като ЕДИН инстанс зад Nginx (виж
// DEPLOY.md); при хоризонтално мащабиране се заменя с Redis. Прозорец с
// плъзгащ се брояч; чисти се сам, за да не расте безкрайно.

export { rateLimit } from '@/lib/limiter';

/**
 * IP на клиента. Доверяваме само хедърите, които reverse proxy-то
 * ПРЕЗАПИСВА (Nginx `X-Real-IP`, Cloudflare `CF-Connecting-IP`) — НЕ първия
 * елемент на `X-Forwarded-For`, който клиентът може да подправи; взимаме
 * последния (добавен от нашия proxy).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  const cf = h.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return 'unknown';
}
