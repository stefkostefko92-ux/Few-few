import 'server-only';
import { prisma } from '@/lib/db';
import { RETENTION_DAYS, daysAgo } from '@/lib/retention-days';

// Срок за аналитичните събития (до 13 месеца, обещан в политиката за
// поверителност). Чистенето е лениво — вика се от маршрута за клик, най-много
// веднъж на час на процес. Реален cron (DEPLOY.md §9) е по-добър, но без него
// обещанието пак се държи, докато има трафик.

const ONE_HOUR = 60 * 60 * 1000;
let lastPurge = 0;

export async function maybePurgeOldClicks(): Promise<void> {
  const now = Date.now();
  if (now - lastPurge < ONE_HOUR) return;
  lastPurge = now;
  await prisma.clickEvent
    .deleteMany({
      where: { createdAt: { lt: daysAgo(RETENTION_DAYS.clickEvent, now) } },
    })
    .catch(() => undefined);
}
