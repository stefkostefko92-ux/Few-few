import type { Prisma } from '@prisma/client';
import { cache } from 'react';

import { prisma } from './db';
import { compareFeatured, compareServers } from './rating';
import { bucketByHour, bucketHourLabels, HOUR_MS } from './snapshots';

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
  // ЛИЧНИ ДАННИ — единственото такова поле в публичния набор. Излиза, защото
  // списъкът с играчи е обявена функция; режимът е в `/privacy`.
  playerNames: true,
  playersSeenAt: true,
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

/**
 * Таван на списъка — предпазител, не страниране. Страниците (`?page=`) режат
 * подредения списък, затова той трябва да е ЦЕЛИЯТ: при таван 200 сървърите
 * след 200-ния нямаха нито един вътрешен линк (838 от 1038 на живо) и стигаха
 * до търсачката само през sitemap-а.
 */
export const MAX_LISTED = 2000;

export async function listPublicServers(filter: ServerFilter = {}): Promise<PublicServer[]> {
  try {
    const rows = await prisma.server.findMany({
      where: {
        status: 'APPROVED',
        // Псевдонимите са същият сървър под стар Cfx код — един сървър, един ред.
        canonicalId: null,
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
      take: MAX_LISTED,
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
 * Колко КАНОНИЧНИ сървъра има по рамка и с whitelist. Страница-филтър без
 * нито един сървър е празна страница: `noindex, follow` и извън sitemap-а
 * (на живо `/servers/whitelist` и `/servers/framework/ox_core` бяха точно
 * такива). `ok: false` — базата не отговори; тогава НЕ крием нищо.
 */
export const listingCounts = cache(async function listingCounts(): Promise<{
  ok: boolean;
  frameworks: Partial<Record<PublicServer['framework'], number>>;
  whitelist: number;
}> {
  try {
    const where = { status: 'APPROVED' as const, canonicalId: null };
    const [byFramework, whitelist] = await Promise.all([
      prisma.server.groupBy({ by: ['framework'], where, _count: { _all: true } }),
      prisma.server.count({ where: { ...where, whitelist: true } }),
    ]);
    return {
      ok: true,
      frameworks: Object.fromEntries(byFramework.map((row) => [row.framework, row._count._all])),
      whitelist,
    };
  } catch (error) {
    console.error('[servers] броят по филтри не се прочете', error);
    return { ok: false, frameworks: {}, whitelist: 0 };
  }
});

/**
 * Обобщението се смята с отделен `aggregate` върху ВСИЧКИ одобрени ревюта.
 * Ако се четеше от `reviews.length`, числото щеше да е капнато на `take` —
 * тоест сайтът щеше публично да твърди „4.6 / 5 от 20“ при 100 ревюта.
 */
export async function reviewSummary(serverIds: readonly string[]): Promise<{ average: number | null; count: number }> {
  try {
    const result = await prisma.review.aggregate({
      // Цялата група (каноничният + псевдонимите): ревю, писано на стария адрес
      // на същия сървър, си остава ревю за него.
      where: { serverId: { in: [...serverIds] }, status: 'APPROVED' },
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

/** Полетата на страницата на сървър — `publicServerSelect` плюс онова, което стои само там. */
const serverPageSelect = {
  ...publicServerSelect,
  id: true,
  description: true,
  discordUrl: true,
  websiteUrl: true,
  cfxJoinCode: true,
  address: true,
  createdAt: true,
  lastCheckedAt: true,
  lastSeenInListAt: true,
  lastActiveAt: true,
  contentUpdatedAt: true,
  canonicalId: true,
  canonical: { select: { slug: true, status: true } },
  aliases: { where: { status: 'APPROVED' }, select: { id: true, lastActiveAt: true } },
} satisfies Prisma.ServerSelect;

type ServerPageRow = Prisma.ServerGetPayload<{ select: typeof serverPageSelect }>;

export type ServerPage =
  /** Псевдоним — страницата пренасочва (308) към каноничния адрес. */
  | { kind: 'alias'; canonicalSlug: string }
  | {
      kind: 'server';
      server: Omit<ServerPageRow, 'canonical' | 'aliases'>;
      /** Каноничният + псевдонимите: за ревютата, графиката и активността. */
      groupIds: string[];
      /** Последната активност на ЦЕЛИЯ сървър (всички регистрации). */
      groupLastActiveAt: Date | null;
      reviews: Array<{
        id: string;
        rating: number;
        body: string | null;
        authorAlias: string | null;
        createdAt: Date;
        reply: string | null;
        repliedAt: Date | null;
      }>;
    };

/**
 * Страницата на сървър по slug. `cache` — `generateMetadata` и страницата я
 * искат в една и съща заявка; без него двете четения бяха две отделни заявки
 * към базата.
 */
export const getPublicServer = cache(async function getPublicServer(slug: string): Promise<ServerPage | null> {
  try {
    const row = await prisma.server.findFirst({ where: { slug, status: 'APPROVED' }, select: serverPageSelect });
    if (!row) return null;

    // Псевдоним на ОДОБРЕН каноничен → пренасочване. Свален междувременно
    // каноничен (до следващото откриване) не скрива псевдонима: показваме го
    // сам, докато планът не прегрупира.
    if (row.canonicalId && row.canonical?.status === 'APPROVED') {
      return { kind: 'alias', canonicalSlug: row.canonical.slug };
    }

    const { canonical: _canonical, aliases, ...server } = row;
    void _canonical;
    const groupIds = [server.id, ...aliases.map((alias) => alias.id)];
    const groupLastActiveAt = [server.lastActiveAt, ...aliases.map((alias) => alias.lastActiveAt)].reduce<Date | null>(
      (max, at) => (at && (!max || at > max) ? at : max),
      null,
    );

    const reviews = await prisma.review.findMany({
      where: { serverId: { in: groupIds }, status: 'APPROVED' },
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
    });

    return { kind: 'server', server, groupIds, groupLastActiveAt, reviews };
  } catch (error) {
    console.error('[servers] сървърът не се прочете', error);
    return null;
  }
});

/**
 * Историята на играчите за последните 24 часа, свита в кофи по час.
 * Празен масив значи „няма измерване“ — графиката го различава от „0 играчи“.
 *
 * Стойностите и етикетите се смятат от ЕДИН `now`. Смятани поотделно на
 * викащата страна, двете можеха да паднат от двете страни на кръгъл час и
 * графиката да покаже стойност под грешен час.
 */
export async function playersLastDay(
  serverIds: readonly string[],
  locale = 'bg',
): Promise<{ values: number[]; labels: string[] }> {
  const now = new Date();
  try {
    const since = new Date(now.getTime() - 24 * HOUR_MS);
    const rows = await prisma.serverSnapshot.findMany({
      // Цялата група: в часа на пререгистрацията снимките са по двата реда.
      // Кофата взема МАКСИМУМА, значи две регистрации не се събират двойно.
      where: { serverId: { in: [...serverIds] }, at: { gte: since } },
      select: { at: true, players: true },
      orderBy: { at: 'asc' },
    });
    return { values: bucketByHour(rows, 24, now), labels: bucketHourLabels(24, now, locale) };
  } catch (error) {
    console.error('[servers] историята на играчите не се прочете', error);
    return { values: [], labels: [] };
  }
}

/**
 * Всичко за страницата на сървър наведнъж, кеширано за заявката по
 * (slug, език) — `generateMetadata` иска същите факти като страницата
 * (ревюта, пик за 24 ч.) за описанието и за `robots`.
 */
export const getServerPageData = cache(async function getServerPageData(slug: string, locale: string) {
  const page = await getPublicServer(slug);
  if (!page || page.kind === 'alias') return page;
  const [summary, history] = await Promise.all([
    reviewSummary(page.groupIds),
    playersLastDay(page.groupIds, locale),
  ]);
  return { ...page, summary, history };
});

export { averageRating, compareFeatured, compareServers, isFeatured } from './rating';
