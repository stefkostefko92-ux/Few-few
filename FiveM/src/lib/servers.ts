import type { Prisma } from '@prisma/client';

import { prisma } from './db';
import { compareServers } from './rating';

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
export type ServerFilter = { framework?: PublicServer['framework']; whitelist?: boolean };

export async function listPublicServers(filter: ServerFilter = {}): Promise<PublicServer[]> {
  try {
    const rows = await prisma.server.findMany({
      where: {
        status: 'APPROVED',
        ...(filter.framework ? { framework: filter.framework } : {}),
        ...(filter.whitelist === undefined ? {} : { whitelist: filter.whitelist }),
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
          select: { id: true, rating: true, body: true, authorAlias: true, createdAt: true },
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

export { averageRating, compareServers, isFeatured } from './rating';
