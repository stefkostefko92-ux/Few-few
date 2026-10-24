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
import {
  displayName,
  formatServerAddress,
  isPrivatePlaceholder,
  parseServerAddress,
} from '../src/lib/fivem';
import { buildServerSlug, INDEXABLE_ACTIVE_DAYS } from '../src/lib/server-identity';
import { applyIdentityPlan } from '../src/lib/server-registry';

const prisma = new PrismaClient();

/** Първият публичен адрес; частните заместители на Cfx нямат такъв. */
function pickAddress(server: CfxServer): string | null {
  for (const endpoint of server.connectEndPoints) {
    // Общият guard, не собствено `includes`: същата проверка липсваше в
    // `resolveJoinCode` и оттам плейсхолдърът влизаше през задната врата.
    if (isPrivatePlaceholder(endpoint)) continue;
    const parsed = parseServerAddress(endpoint);
    if (parsed) return formatServerAddress(parsed);
  }
  return null;
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
  /** Активен преди повече от прозореца → страницата се връща в индекса. */
  const dormantBefore = new Date(now.getTime() - INDEXABLE_ACTIVE_DAYS * 86_400_000);
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
      // Поне един играч в списъка = реална активност (правилото за индексиране).
      ...(server.clients > 0 ? { lastActiveAt: now } : {}),
    } satisfies Prisma.ServerUpdateInput;

    if (known.has(server.endPoint)) {
      // Името и описанието НЕ се презаписват: ако собственикът е поел
      // листинга и ги е редактирал, списъкът не бива да ги връща назад.
      //
      // СВАЛЕНИЯТ (`REJECTED`) не се пипа изобщо. Обикновено той още е в
      // списъка на Cfx.re, и обновяването му вдигаше `updatedAt` на всеки
      // пробег — а `prune.ts` брои шестте месеца до изтриването на ревютата
      // именно от `updatedAt`, тоест срокът не изтичаше никога.
      // Сървър, спал по-дълго от прозореца на активност, се връща в индекса —
      // това Е промяна на страницата и `lastmod` трябва да я каже, иначе
      // търсачката няма причина да мине пак. Само тогава, не при всеки пробег.
      if (server.clients > 0) {
        await prisma.server.updateMany({
          where: {
            cfxJoinCode: server.endPoint,
            status: { not: 'REJECTED' },
            OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: dormantBefore } }],
          },
          data: { contentUpdatedAt: now },
        });
      }
      await prisma.server.updateMany({
        where: { cfxJoinCode: server.endPoint, status: { not: 'REJECTED' } },
        data: fromList,
      });
      updated += 1;
      continue;
    }

    const slug = buildServerSlug(server.hostname, server.endPoint, taken);
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

  // ЕДИН адрес на сървър. Новата регистрация на вече познат сървър (нов Cfx
  // код) е ред-псевдоним на стария, а живият код се мести към стария адрес —
  // виж `applyIdentityPlan`. Тук, а не в отделен cron: точно този пробег е
  // създал новите редове.
  const identity = await applyIdentityPlan(prisma, now);

  console.log(
    `Открити ${discovered.length} български сървъра: ${created} нови, ${updated} обновени. ` +
      `Идентичност: ${identity.groups} сървъра с повече от една регистрация, ` +
      `${identity.aliases} псевдонима (${identity.changed} сменени), ${identity.rebound} преместени живи кода.`,
  );
}

main()
  .catch((error) => {
    console.error('Откриването се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
