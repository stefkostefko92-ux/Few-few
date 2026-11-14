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
import { readEnv } from '../src/lib/env';
import { probeServer, resolveJoinCode } from '../src/lib/fivem-query';
import { INDEXABLE_ACTIVE_DAYS } from '../src/lib/server-identity';

const prisma = new PrismaClient();

function concurrency(): number {
  const raw = Number(readEnv('FIVEM_PING_CONCURRENCY'));
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
    // Псевдонимите (`canonicalId`) НЕ се пингват: това са старите регистрации
    // на същия сървър, обикновено със същия адрес — „ODYSSEY RolePlay“ беше
    // пингван 12 пъти на всеки 3 минути. Живостта им се вижда от списъка на
    // Cfx.re (`lastSeenInListAt`), а страницата им пренасочва.
    where: { status: 'APPROVED', canonicalId: null },
    select: {
      id: true,
      slug: true,
      address: true,
      cfxJoinCode: true,
      lastSeenInListAt: true,
      framework: true,
      lastActiveAt: true,
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
      // Същото условие по кода като долу — виж бележката при пингването.
      await prisma.server.updateMany({
        where: { id: server.id, cfxJoinCode: server.cfxJoinCode },
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

    const active = status.online && status.players > 0;
    // Видима промяна на страницата → `lastmod`: разпозната нова рамка, или
    // сървър, спал по-дълго от прозореца за индексиране, който пак има хора.
    // Живият брой играчи НЕ е такава промяна — иначе всеки адрес е „сега“.
    const frameworkChanged = status.framework !== 'UNKNOWN' && status.framework !== server.framework;
    const reactivated =
      active &&
      (!server.lastActiveAt ||
        now.getTime() - server.lastActiveAt.getTime() > INDEXABLE_ACTIVE_DAYS * 86_400_000);

    await prisma.$transaction([
      // `updateMany` със СЪЩИЯ код в условието: откриването може междувременно
      // да е преместило живата регистрация към този ред (`rebindRegistration`).
      // Тогава резултатът от пингването е за стария адрес и не бива да я
      // презапише; следващият пробег след 3 мин пингва новия.
      prisma.server.updateMany({
        where: { id: server.id, cfxJoinCode: server.cfxJoinCode },
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
          ...(active ? { lastActiveAt: now } : {}),
          ...(frameworkChanged || reactivated ? { contentUpdatedAt: now } : {}),
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
