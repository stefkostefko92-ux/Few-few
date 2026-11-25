/**
 * Записът на идентичността: кой ред е каноничният, кой е псевдоним, и
 * преместването на живата регистрация към каноничния адрес. Логиката (кое с
 * кое се слива, кое се индексира) е ЧИСТА и е в `server-identity.ts`; тук е
 * само Prisma.
 *
 * Клиентът се ПОДАВА, не се внася: ползват го и cron скриптовете (собствен
 * `PrismaClient`), и приложението (`@/lib/db`).
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { indexDecision, planIdentities, type IndexReason } from './server-identity';

/**
 * Полетата на РЕГИСТРАЦИЯТА — онова, което принадлежи на Cfx кода, а не на
 * сървъра като място: кодът, адресът, иконата, живият статус и моментната
 * снимка на играчите. Името, описанието, връзките, етикетите и ревютата са на
 * сървъра и НЕ се местят.
 */
const REGISTRATION = {
  cfxJoinCode: true,
  address: true,
  iconVersion: true,
  lastSeenInListAt: true,
  online: true,
  lastProbe: true,
  players: true,
  maxPlayers: true,
  lastOnlineAt: true,
  lastCheckedAt: true,
  playerNames: true,
  playersSeenAt: true,
} satisfies Prisma.ServerSelect;

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Разменя регистрациите на два реда: каноничният получава живата (кодът,
 * който работи днес), псевдонимът — мъртвата. Така адресът на страницата не се
 * мени, когато сървърът се пререгистрира, а „Влез“ води към работещия код.
 *
 * Размяна, не копие: `cfxJoinCode` е уникален, а и мъртвият код трябва да
 * остане на ред — върне ли се в списъка, откриването трябва да го познае, а не
 * да прави нов ред.
 */
export async function rebindRegistration(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  liveId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const select = { ...REGISTRATION, lastActiveAt: true, framework: true } as const;
  const [canonical, live] = await Promise.all([
    tx.server.findUnique({ where: { id: canonicalId }, select }),
    tx.server.findUnique({ where: { id: liveId }, select }),
  ]);
  if (!canonical || !live) return false;

  const { lastActiveAt: canonicalActive, framework: canonicalFramework, ...canonicalReg } = canonical;
  const { lastActiveAt: liveActive, framework: liveFramework, ...liveReg } = live;

  // Уникалният ключ се освобождава първо — иначе вторият запис гърми с P2002.
  await tx.server.update({ where: { id: liveId }, data: { cfxJoinCode: null } });
  await tx.server.update({
    where: { id: canonicalId },
    data: {
      ...liveReg,
      lastActiveAt: latest(canonicalActive, liveActive),
      // Рамката е на сървъра, но разпознатата бие „неизвестна“.
      framework: canonicalFramework === 'UNKNOWN' ? liveFramework : canonicalFramework,
      // Нов код за „Влез“ — видима промяна на страницата.
      contentUpdatedAt: now,
    },
  });
  await tx.server.update({ where: { id: liveId }, data: canonicalReg });
  return true;
}

export type IdentityResult = { groups: number; aliases: number; changed: number; rebound: number };

/**
 * Прилага `planIdentities` върху ОДОБРЕНИТЕ сървъри. Идемпотентно: втори
 * пробег без нови данни не пише нищо. Пуска се в края на всяко откриване
 * (`scripts/discover-servers.ts`) и на ръка от `scripts/dedupe-servers.ts`.
 *
 * Свалените (`REJECTED`) и чакащите не участват: решението на модератора е за
 * конкретния ред и тук не се разширява автоматично върху други редове.
 */
export async function applyIdentityPlan(
  db: PrismaClient,
  now: Date = new Date(),
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<IdentityResult> {
  const rows = await db.server.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      name: true,
      source: true,
      createdAt: true,
      lastSeenInListAt: true,
      players: true,
      canonicalId: true,
    },
  });
  const plan = planIdentities(rows, now);
  const current = new Map(rows.map((row) => [row.id, row.canonicalId]));

  const becameCanonical: string[] = [];
  const toAlias = new Map<string, string[]>();
  for (const [id, target] of plan.canonicalOf) {
    if (current.get(id) === target) continue;
    if (target === null) becameCanonical.push(id);
    else toAlias.set(target, [...(toAlias.get(target) ?? []), id]);
  }

  const canonicalIds = new Set([...plan.canonicalOf].filter(([, target]) => target !== null).map(([, t]) => t));
  const result: IdentityResult = {
    groups: canonicalIds.size,
    aliases: [...plan.canonicalOf.values()].filter((target) => target !== null).length,
    changed: becameCanonical.length + [...toAlias.values()].reduce((sum, ids) => sum + ids.length, 0),
    rebound: plan.rebind.length,
  };
  if (dryRun) return result;

  if (result.changed > 0) {
    await db.$transaction([
      // Ред, който от псевдоним става каноничен, ПОЯВЯВА страница — за
      // търсачката това е промяна (lastmod).
      ...(becameCanonical.length > 0
        ? [
            db.server.updateMany({
              where: { id: { in: becameCanonical } },
              data: { canonicalId: null, contentUpdatedAt: now },
            }),
          ]
        : []),
      ...[...toAlias].map(([target, ids]) =>
        db.server.updateMany({ where: { id: { in: ids } }, data: { canonicalId: target } }),
      ),
    ]);
  }

  for (const { canonicalId, liveId } of plan.rebind) {
    await db.$transaction((tx) => rebindRegistration(tx, canonicalId, liveId, now));
  }
  return result;
}

export type ServerIndexRow = {
  id: string;
  slug: string;
  name: string;
  canonicalId: string | null;
  contentUpdatedAt: Date;
  index: boolean;
  reason: IndexReason;
};

/**
 * Решението за индексиране за ВСИЧКИ одобрени сървъри — едно четене, без
 * агрегат по снимките. Активността и ревютата на псевдонимите се броят към
 * каноничния: те са същият сървър, а ревю, писано на стария адрес, си остава
 * ревю за него.
 */
export async function serverIndexDecisions(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<ServerIndexRow[]> {
  const rows = await db.server.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      slug: true,
      name: true,
      source: true,
      description: true,
      tagline: true,
      lastActiveAt: true,
      canonicalId: true,
      contentUpdatedAt: true,
      _count: { select: { reviews: { where: { status: 'APPROVED' } } } },
    },
  });

  const activity = new Map<string, Date | null>();
  const reviews = new Map<string, number>();
  for (const row of rows) {
    const owner = row.canonicalId ?? row.id;
    activity.set(owner, latest(activity.get(owner) ?? null, row.lastActiveAt));
    reviews.set(owner, (reviews.get(owner) ?? 0) + row._count.reviews);
  }

  return rows.map((row) => {
    const decision = indexDecision(
      {
        name: row.name,
        source: row.source,
        description: row.description,
        tagline: row.tagline,
        lastActiveAt: activity.get(row.id) ?? null,
        approvedReviews: reviews.get(row.id) ?? 0,
        canonicalId: row.canonicalId,
      },
      now,
    );
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      canonicalId: row.canonicalId,
      contentUpdatedAt: row.contentUpdatedAt,
      ...decision,
    };
  });
}
