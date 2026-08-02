import type { Prisma } from '@prisma/client';

import { prisma } from './db';
import { compareFeatured, compareServers } from './rating';
import { bucketByHour, HOUR_MS } from './snapshots';

/** Публичните полета на сървър — нищо повече не напуска базата. */
export const publicServerSelect = {
  slug: true,
  name: true,
  tagline: true,
  framework: true,
  whitelist: true,
  language: true,
  tags: true,
  online: true,
  lastProbe: true,
  source: true,
  iconVersion: true,
  players: true,
  maxPlayers: true,
  lastOnlineAt: true,
  featuredUntil: true,
} satisfies Prisma.ServerSelect;

export type PublicServer = Prisma.ServerGetPayload<{ select: typeof publicServerSelect }>;

/**
 * Подредбата: платено промотиране → онлайн → повече играчи → азбучно.
 * Базата може да е недостъпна (build без БД) — тогава връщаме празен списък,
 * вместо да падне цялата страница.
 */
export type ServerSort = 'default' | 'players' | 'name';
export type ServerFilter = {
  framework?: PublicServer['framework'];
  whitelist?: boolean;
  /** Свободен текст от посетителя — минава само през `contains`, не в raw SQL. */
  query?: string;
  sort?: ServerSort;
};

export async function listPublicServers(filter: ServerFilter = {}): Promise<PublicServer[]> {
  try {
    const rows = await prisma.server.findMany({
      where: {
        status: 'APPROVED',
        ...(filter.framework ? { framework: filter.framework } : {}),
        ...(filter.whitelist === undefined ? {} : { whitelist: filter.whitelist }),
        ...(filter.query ? { name: { contains: filter.query, mode: 'insensitive' as const } } : {}),
      },
      select: publicServerSelect,
      orderBy: [
        // `nulls: 'last'` е задължително: Postgres подрежда NULL ПЪРВО при DESC,
        // тоест непромотираните сървъри изместваха промотирания най-отдолу —
        // точно обратното на обявеното в условията („Как подреждаме сървърите“).
        { featuredUntil: { sort: 'desc', nulls: 'last' } },
        { online: 'desc' },
        { players: 'desc' },
        { name: 'asc' },
      ],
      take: 200,
    });
    // Крайната подредба е в `compareServers`: SQL-ът не може да изрази
    // „промотиран, но само докато е валидно“, а `featuredUntil DESC` вдига и
    // изтеклите — с ранг, но без значка.
    // Избраната подредба НЕ отменя промотирането: платеното място е обявено в
    // условията, значи не бива да изчезва, защото посетителят е натиснал
    // „по име“. Изборът подрежда ВЪТРЕ в двете групи.
    if (filter.sort === 'players') {
      return rows.sort(
        (a, b) => compareFeatured(a, b) || b.players - a.players || a.name.localeCompare(b.name, 'bg'),
      );
    }
    if (filter.sort === 'name') {
      return rows.sort((a, b) => compareFeatured(a, b) || a.name.localeCompare(b.name, 'bg'));
    }
    return rows.sort((a, b) => compareServers(a, b));
  } catch (error) {
    console.error('[servers] списъкът не се прочете', error);
    return [];
  }
}

/**
 * Обобщението се смята с отделен `aggregate` върху ВСИЧКИ одобрени ревюта.
 * Ако се четеше от `reviews.length`, числото щеше да е капнато на `take` —
 * тоест сайтът щеше публично да твърди „4.6 / 5 от 20“ при 100 ревюта.
 */
export async function reviewSummary(serverId: string): Promise<{ average: number | null; count: number }> {
  try {
    const result = await prisma.review.aggregate({
      where: { serverId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const average = result._avg.rating;
    return {
      average: average === null ? null : Math.round(average * 10) / 10,
      count: result._count._all,
    };
  } catch (error) {
    console.error('[servers] обобщението на ревютата се провали', error);
    return { average: null, count: 0 };
  }
}

/** Колко ревюта показваме на страницата (обобщението не зависи от това). */
export const REVIEWS_SHOWN = 20;

export async function getPublicServer(slug: string) {
  try {
    return await prisma.server.findFirst({
      where: { slug, status: 'APPROVED' },
      select: {
        ...publicServerSelect,
        id: true,
        description: true,
        discordUrl: true,
        websiteUrl: true,
        cfxJoinCode: true,
        address: true,
        updatedAt: true,
        reviews: {
          where: { status: 'APPROVED' },
          select: {
            id: true,
            rating: true,
            body: true,
            authorAlias: true,
            createdAt: true,
            // Отговорът на сървъра — обещан в Общите условия, значи трябва да
            // напусне базата, за да се покаже под ревюто.
            reply: true,
            repliedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: REVIEWS_SHOWN,
        },
      },
    });
  } catch (error) {
    console.error('[servers] сървърът не се прочете', error);
    return null;
  }
}

/**
 * Историята на играчите за последните 24 часа, свита в кофи по час.
 * Празен масив значи „няма измерване“ — графиката го различава от „0 играчи“.
 */
export async function playersLastDay(serverId: string): Promise<number[]> {
  try {
    const since = new Date(Date.now() - 24 * HOUR_MS);
    const rows = await prisma.serverSnapshot.findMany({
      where: { serverId, at: { gte: since } },
      select: { at: true, players: true },
      orderBy: { at: 'asc' },
    });
    return bucketByHour(rows);
  } catch (error) {
    console.error('[servers] историята на играчите не се прочете', error);
    return [];
  }
}

export { averageRating, compareFeatured, compareServers, isFeatured } from './rating';
