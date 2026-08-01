/**
 * Открива българските FiveM сървъри от публичния списък на Cfx.re и ги вкарва
 * в директорията. Пуска се по cron на 30–60 минути — НИКОГА при заявка на
 * посетител (снапшотът е около 19 MB).
 *
 *   npm run servers:discover
 *
 * Откритите сървъри влизат с `source: DISCOVERED` — те НЕ са подадени от
 * собствениците си. Затова страницата им носи бележка и покана да поемат
 * листинга, а условията обещават сваляне при поискване.
 */

import { PrismaClient, type Prisma } from '@prisma/client';

import { fetchBulgarianServers, type CfxServer } from '../src/lib/cfx';
import { displayName, parseServerAddress, formatServerAddress } from '../src/lib/fivem';
import { isValidSlug, slugify } from '../src/lib/slug';

const prisma = new PrismaClient();

/** Първият публичен адрес; частните заместители на Cfx нямат такъв. */
function pickAddress(server: CfxServer): string | null {
  for (const endpoint of server.connectEndPoints) {
    if (endpoint.includes('private-placeholder')) continue;
    const parsed = parseServerAddress(endpoint);
    if (parsed) return formatServerAddress(parsed);
  }
  return null;
}

/**
 * Уникален slug. Името идва от чужд сървър, тоест може да е емоджи, цветни
 * кодове или дубликат — затова: чистене, после проверка, после суфикс с Cfx
 * кода, който е гарантирано уникален.
 */
function buildSlug(server: CfxServer, taken: Set<string>): string {
  const base = slugify(displayName(server.hostname, ''));
  const candidate = isValidSlug(base) ? base : `server-${server.endPoint}`;
  if (!taken.has(candidate)) return candidate;

  const suffixed = `${candidate}-${server.endPoint}`.slice(0, 60);
  return taken.has(suffixed) ? `server-${server.endPoint}` : suffixed;
}

async function main() {
  const discovered = await fetchBulgarianServers();
  if (discovered.length === 0) {
    console.error('Списъкът върна нула български сървъра — нищо не се пипа.');
    // Нулев резултат почти винаги значи счупен договор от тяхна страна, а не
    // изчезнала общност. Мълчаливото изтриване на всичко е по-лошо от нищо.
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.server.findMany({ select: { slug: true, cfxJoinCode: true } });
  const taken = new Set(existing.map((server) => server.slug));
  const known = new Map(existing.filter((s) => s.cfxJoinCode).map((s) => [s.cfxJoinCode!, s.slug]));

  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const server of discovered) {
    const name = displayName(server.hostname);
    const address = pickAddress(server);

    /** Полета, които списъкът владее — те се обновяват винаги. */
    const fromList = {
      iconVersion: server.iconVersion ?? null,
      lastSeenInListAt: now,
      players: Math.min(server.clients, 2048),
      maxPlayers: Math.min(server.maxClients, 2048),
      // Присъствието в живия списък Е доказателството, че сървърът работи —
      // затова тук се пише и `lastProbe`. Без него картата показваше светеща
      // точка до надпис „офлайн“ (точката чете `online`, текстът — `lastProbe`).
      online: true,
      lastProbe: 'ONLINE' as const,
      ...(address ? { address } : {}),
    } satisfies Prisma.ServerUpdateInput;

    if (known.has(server.endPoint)) {
      // Името и описанието НЕ се презаписват: ако собственикът е поел
      // листинга и ги е редактирал, списъкът не бива да ги връща назад.
      await prisma.server.update({ where: { cfxJoinCode: server.endPoint }, data: fromList });
      updated += 1;
      continue;
    }

    const slug = buildSlug(server, taken);
    taken.add(slug);

    await prisma.server.create({
      data: {
        slug,
        name,
        cfxJoinCode: server.endPoint,
        source: 'DISCOVERED',
        // Откритите влизат публично веднага: директория, която показва само
        // подадените, не е директория. Свалянето е по искане (Общи условия).
        status: 'APPROVED',
        language: 'bg',
        ...fromList,
      },
    });
    created += 1;
  }

  console.log(
    `Открити ${discovered.length} български сървъра: ${created} нови, ${updated} обновени.`,
  );
}

main()
  .catch((error) => {
    console.error('Откриването се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
