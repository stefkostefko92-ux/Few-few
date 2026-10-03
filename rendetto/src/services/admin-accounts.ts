import { Prisma, type Plan } from '@prisma/client';
import { isIP } from 'node:net';
import { prisma } from '../db.js';

export const PAGE_SIZE = 25;

export const STATUS_FILTERS = [
  'all',
  'active',
  'expired',
  'unverified',
  'banned',
  'locked',
  'staff',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SORTS = ['created', 'login', 'expires', 'email'] as const;
export type SortKey = (typeof SORTS)[number];

export interface AccountQuery {
  q: string;
  plan: Plan | 'all';
  status: StatusFilter;
  sort: SortKey;
  dir: 'asc' | 'desc';
  page: number;
}

/** Филтърът по състояние, преведен в условие към базата (часът е „сега“ на заявката). */
function statusWhere(status: StatusFilter, now: Date): Prisma.UserWhereInput {
  switch (status) {
    case 'active':
      return {
        bannedAt: null,
        emailVerifiedAt: { not: null },
        OR: [{ plan: 'LIFETIME' }, { planExpiresAt: { gt: now } }],
      };
    case 'expired':
      return { plan: { in: ['TRIAL', 'PREMIUM'] }, planExpiresAt: { lte: now } };
    case 'unverified':
      return { emailVerifiedAt: null };
    case 'banned':
      return { bannedAt: { not: null } };
    case 'locked':
      return { lockedUntil: { gt: now } };
    case 'staff':
      return { role: { not: 'CUSTOMER' } };
    default:
      return {};
  }
}

/**
 * Търсене: имейл, име или id; IP адрес търси и в историята на входовете — само за роля, която вижда
 * входовете (`logins:view`). За останалите IP не е ключ за търсене.
 */
async function searchWhere(q: string, byIp: boolean): Promise<Prisma.UserWhereInput> {
  const term = q.trim().slice(0, 120);
  if (!term) return {};
  if (isIP(term)) {
    if (!byIp) return { id: '' };
    const logins = await prisma.loginEvent.findMany({
      where: { ip: term, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
      take: 500,
    });
    const ids = logins.map((row) => row.userId).filter((id): id is string => Boolean(id));
    return { OR: [{ signupIp: term }, { lastLoginIp: term }, { id: { in: ids } }] };
  }
  return {
    OR: [
      { email: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
      { id: term },
    ],
  };
}

function orderBy(sort: SortKey, dir: 'asc' | 'desc'): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case 'login':
      return [{ lastLoginAt: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }];
    case 'expires':
      return [{ planExpiresAt: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }];
    case 'email':
      return [{ email: dir }];
    default:
      return [{ createdAt: dir }];
  }
}

export async function listAccounts(query: AccountQuery, byIp: boolean, now: Date = new Date()) {
  const where: Prisma.UserWhereInput = {
    AND: [
      await searchWhere(query.q, byIp),
      query.plan === 'all' ? {} : { plan: query.plan },
      statusWhere(query.status, now),
    ],
  };
  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: orderBy(query.sort, query.dir),
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        planExpiresAt: true,
        emailVerifiedAt: true,
        totpEnabledAt: true,
        bannedAt: true,
        lockedUntil: true,
        lastLoginAt: true,
        lastLoginIp: true,
        lastLoginCountry: true,
        createdAt: true,
        _count: { select: { projects: true } },
      },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Броячите за таблото: по план, по състояние, нови регистрации. */
export async function dashboardCounts(now: Date = new Date()) {
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const month = new Date(now.getTime() - 30 * 86_400_000);
  const [
    trialActive,
    trialExpired,
    premiumActive,
    premiumExpired,
    lifetime,
    unverified,
    banned,
    newWeek,
    newMonth,
    openRequests,
    logins24h,
  ] = await prisma.$transaction([
    prisma.user.count({ where: { role: 'CUSTOMER', plan: 'TRIAL', planExpiresAt: { gt: now } } }),
    prisma.user.count({ where: { role: 'CUSTOMER', plan: 'TRIAL', planExpiresAt: { lte: now } } }),
    prisma.user.count({ where: { role: 'CUSTOMER', plan: 'PREMIUM', planExpiresAt: { gt: now } } }),
    prisma.user.count({
      where: { role: 'CUSTOMER', plan: 'PREMIUM', planExpiresAt: { lte: now } },
    }),
    prisma.user.count({ where: { role: 'CUSTOMER', plan: 'LIFETIME' } }),
    prisma.user.count({ where: { emailVerifiedAt: null } }),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.user.count({ where: { createdAt: { gte: month } } }),
    prisma.upgradeRequest.count({ where: { status: 'OPEN' } }),
    prisma.loginEvent.count({
      where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
    }),
  ]);
  return {
    trialActive,
    trialExpired,
    premiumActive,
    premiumExpired,
    lifetime,
    unverified,
    banned,
    newWeek,
    newMonth,
    openRequests,
    logins24h,
  };
}

/** Последните събития по сигурността за таблото: неуспешни входове, банове, заключвания. */
export async function recentSecurityEvents(limit = 12) {
  return prisma.loginEvent.findMany({
    where: { outcome: { in: ['BAD_PASSWORD', 'LOCKED', 'THROTTLED', 'BANNED', 'MFA_FAILED'] } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { id: true, email: true } } },
  });
}

export async function accountDetail(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      planChanges: { orderBy: { createdAt: 'desc' }, take: 50 },
      bans: { orderBy: { createdAt: 'desc' }, take: 50 },
      devices: { orderBy: { lastSeenAt: 'desc' }, take: 50 },
      sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } },
      projects: {
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { id: true, name: true, type: true, updatedAt: true, createdAt: true },
      },
      upgradeRequests: { orderBy: { createdAt: 'desc' }, take: 20 },
      _count: {
        select: { projects: true, logins: true, recoveryCodes: { where: { usedAt: null } } },
      },
    },
  });
}
