/**
 * Опреснява статуса на всички одобрени сървъри. Пуска се по cron (напр. на
 * 3 минути) — НЕ при зареждане на страница: чуждите сървъри не бива да ядат
 * заявка на всеки наш посетител.
 *
 *   npm run servers:refresh
 */

import { PrismaClient } from '@prisma/client';

import { formatServerAddress, parseCfxJoinCode } from '../src/lib/fivem';
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
    select: { id: true, slug: true, address: true, cfxJoinCode: true },
  });

  let online = 0;

  await inBatches(servers, concurrency(), async (server) => {
    let address = server.address;

    // Без адрес — опитваме да го резолвираме от cfx кода и го запомняме.
    if (!address && server.cfxJoinCode) {
      const code = parseCfxJoinCode(server.cfxJoinCode);
      const resolved = code ? await resolveJoinCode(code) : null;
      if (resolved) address = formatServerAddress(resolved);
    }

    if (!address) {
      await prisma.server.update({
        where: { id: server.id },
        data: { online: false, lastProbe: 'UNREACHABLE', lastCheckedAt: new Date() },
      });
      return;
    }

    const status = await probeServer(address);
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
