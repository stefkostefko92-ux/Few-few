import type { Prisma } from '@prisma/client';

import { prisma } from './db';

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
    return await prisma.server.findMany({
      where: {
        status: 'APPROVED',
        ...(filter.framework ? { framework: filter.framework } : {}),
        ...(filter.whitelist === undefined ? {} : { whitelist: filter.whitelist }),
      },
      select: publicServerSelect,
      orderBy: [{ featuredUntil: 'desc' }, { online: 'desc' }, { players: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  } catch {
    return [];
  }
}

export async function getPublicServer(slug: string) {
  try {
    return await prisma.server.findFirst({
      where: { slug, status: 'APPROVED' },
      select: {
        ...publicServerSelect,
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
          take: 20,
        },
      },
    });
  } catch {
    return null;
  }
}

export { averageRating, isFeatured } from './rating';
