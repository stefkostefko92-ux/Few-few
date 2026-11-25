/**
 * Преглед (и при нужда прилагане) на правилото „един адрес на сървър“ и на
 * правилото за индексиране — срещу истинската база.
 *
 *   npm run servers:dedupe              # САМО ЧЕТЕ: какво би се променило
 *   npm run servers:dedupe -- --apply   # прилага (същото прави и всяко откриване)
 *
 * Не е нужен по cron: `discover-servers.ts` прилага плана в края на всеки
 * пробег. Тук е, за да се види числото ПРЕДИ деплоя и за да не се чака 45 мин
 * след него.
 */

import { PrismaClient } from '@prisma/client';

import { applyIdentityPlan, serverIndexDecisions } from '../src/lib/server-registry';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const now = new Date();

  const identity = await applyIdentityPlan(prisma, now, { dryRun: !apply });
  console.log(
    `${apply ? 'Приложено' : 'План (нищо не е записано)'}: ` +
      `${identity.groups} сървъра с повече от една регистрация, ${identity.aliases} псевдонима ` +
      `(${identity.changed} за смяна), ${identity.rebound} живи кода за преместване към каноничния адрес.`,
  );

  // Решенията за индексиране се смятат от ЗАПИСАНОТО състояние. При сух
  // пробег псевдонимите още не са записани, значи числото е горна граница.
  const decisions = await serverIndexDecisions(prisma, now);
  const byReason = new Map<string, number>();
  for (const row of decisions) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  const indexed = decisions.filter((row) => row.index).length;

  console.log(`Одобрени сървъри: ${decisions.length}. Индексират се (и влизат в sitemap-а): ${indexed}.`);
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(18)} ${count}`);
  }
  if (!apply && identity.changed > 0) {
    console.log('Псевдонимите още не са записани — пусни с --apply за точното число.');
  }
}

main()
  .catch((error) => {
    console.error('Прегледът се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
