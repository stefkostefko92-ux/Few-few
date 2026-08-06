/**
 * Опреснява статуса на всички одобрени сървъри. Пуска се по cron (напр. на
 * 3 минути) — НЕ при зареждане на страница: чуждите сървъри не бива да ядат
 * заявка на всеки наш посетител.
 *
 *   npm run servers:refresh
 */

import { PrismaClient } from '@prisma/client';

import {
  formatServerAddress,
  isProbeableAddress,
  listSaysOnline,
  parseCfxJoinCode,
} from '../src/lib/fivem';
import { probeServer, resolveJoinCode } from '../src/lib/fivem-query';

const prisma = new PrismaClient();

function concurrency(): number {
  const raw = Number(process.env.FIVEM_PING_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 16) : 6;
}

/** Пуска задачите на порции — чуждите сървъри не се бомбардират наведнъж. */
async function inBatches<T>(items: readonly T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

async function main() {
  const servers = await prisma.server.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      slug: true,
      address: true,
      cfxJoinCode: true,
      lastSeenInListAt: true,
    },
  });

  let online = 0;

  await inBatches(servers, concurrency(), async (server) => {
    // Записаният адрес МОЖЕ да е плейсхолдърът на Cfx, вкаран от по-стара
    // версия на `resolveJoinCode`. Такъв ред сам се лекува тук: третираме го
    // като липсващ и го изчистваме, иначе остава да пингва несъществуващ хост
    // завинаги (клонът за възстановяване долу гледа само за празен адрес).
    const poisoned = !!server.address && !isProbeableAddress(server.address);
    let address = poisoned ? null : server.address;

    // Без адрес — опитваме да го резолвираме от cfx кода и го запомняме.
    if (!address && server.cfxJoinCode) {
      const code = parseCfxJoinCode(server.cfxJoinCode);
      const resolved = code ? await resolveJoinCode(code) : null;
      if (resolved) address = formatServerAddress(resolved);
    }

    if (!address) {
      const now = new Date();
      // „Private“ сървър (Cfx не дава адрес). Присъствието в живия списък Е
      // доказателството, че работи — затова НЕ пипаме `online`/`players`,
      // които откриването е записало от списъка. Обявим ли го офлайн, всеки
      // пробег на 3 мин ще събаря това, което откриването пише на 45 мин, и
      // сървърът ще изглежда офлайн почти винаги.
      const trusted = listSaysOnline(server.lastSeenInListAt, now);
      if (trusted) online += 1;
      await prisma.server.update({
        where: { id: server.id },
        data: {
          lastCheckedAt: now,
          ...(poisoned ? { address: null } : {}),
          ...(trusted ? {} : { online: false, lastProbe: 'UNREACHABLE' as const }),
        },
      });
      return;
    }

    const status = await probeServer(address, { withPlayers: true });
    const now = new Date();
    if (status.online) online += 1;

    await prisma.$transaction([
      prisma.server.update({
        where: { id: server.id },
        data: {
          address: status.address,
          online: status.online,
          lastProbe: status.outcome,
          players: status.players,
          maxPlayers: status.maxPlayers || undefined,
          framework: status.framework === 'UNKNOWN' ? undefined : status.framework,
          lastCheckedAt: now,
          lastOnlineAt: status.online ? now : undefined,
          // Имената се ПРЕЗАПИСВАТ цели, не се трупат: списъкът е моментна
          // снимка кой играе сега, а не история кой някога е играл.
          //
          // `null` (скрит или счупен `players.json`) ИЗЧИСТВА, не запазва.
          // Съблазнително е да се запазят „последните известни“, но точно това
          // би нарушило обещаното в /privacy: сървър, който днес скрие
          // endpoint-а, щеше завинаги да показва имената отпреди скриването.
          // Загубата при кратък отказ е нулева — следващият пробег е след 3 мин.
          ...(status.online && status.playerNames
            ? { playerNames: status.playerNames, playersSeenAt: now }
            : { playerNames: [], playersSeenAt: null }),
        },
      }),
      prisma.serverSnapshot.create({
        data: { serverId: server.id, players: status.players, online: status.online, at: now },
      }),
    ]);
  });

  console.log(`Опреснени ${servers.length} сървъра, ${online} онлайн.`);
}

main()
  .catch((error) => {
    console.error('Опресняването се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
