import 'server-only';
import { headers } from 'next/headers';

// Лек ограничител на заявките за публичните форми и входа (одит M7/L3).
// В паметта на процеса — приложението върви като ЕДИН инстанс зад Nginx (виж
// DEPLOY.md); при хоризонтално мащабиране се заменя с Redis. Прозорец с
// плъзгащ се брояч; чисти се сам, за да не расте безкрайно.

import { pickClientIp } from '@/lib/limiter';

export { isRateLimited, rateLimit } from '@/lib/limiter';

/** IP на клиента — редът на доверие е в `pickClientIp` (limiter.ts). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return pickClientIp((name) => h.get(name));
}
