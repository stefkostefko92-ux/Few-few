import type { Plan } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays } from '../plans/plan.js';
import { CONSENTED } from './device-consent.js';
import { SUCCESSFUL_LOGINS } from './login-outcome.js';

/**
 * Разследването на акаунт в панела: входове, откъде влиза (IP и държава), свързани акаунти по
 * устройство, HWID и IP, одит. Само четене — действията са в admin-actions, admin-create,
 * admin-plan и admin-security.
 */
export async function accountLogins(userId: string, take = 100) {
  return prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { device: { select: { fingerprintHash: true, summary: true } } },
  });
}

/** Разпределение на входовете по IP и държава за акаунта — „откъде влиза“. */
export async function accountIpSummary(userId: string) {
  const rows = await prisma.loginEvent.groupBy({
    by: ['ip', 'country'],
    where: { userId, outcome: { in: [...SUCCESSFUL_LOGINS] } },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 50,
  });
  return rows.map((row) => ({
    ip: row.ip,
    country: row.country,
    count: row._count._all,
    last: row._max.createdAt,
  }));
}

export interface LinkedAccount {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  bannedAt: Date | null;
  createdAt: Date;
  reasons: Array<'device' | 'hwid' | 'ip'>;
}

/** Отпечатък или IP, общ за повече акаунти от това, е твърде общ, за да свързва някого. */
const MAX_SHARED = 10;
const LOOKUP = MAX_SHARED + 1;

/** Само стойностите, които стигат до най-много MAX_SHARED акаунта (по една справка на стойност). */
async function rare(
  values: string[],
  owners: (value: string) => Promise<string[]>,
): Promise<string[]> {
  const out: string[] = [];
  for (const value of values.slice(0, 50)) {
    if (new Set(await owners(value)).size <= MAX_SHARED) out.push(value);
  }
  return out;
}

/**
 * Други акаунти от същото устройство (бисквитка), същия хардуерен отпечатък (HWID) или същото IP.
 * Бисквитката е силен сигнал за повторен тестов период. HWID и IP са по-слаби: еднакви телефони дават
 * еднакъв отпечатък, мобилен оператор и офис — общо IP. Затова отпечатък или IP, общ за повече от
 * MAX_SHARED акаунта, не свързва никого, и всяка справка е с таван.
 *
 * Устройството и HWID служат на целите на доставчика, затова искат съгласие: свързват само акаунт
 * със съгласие с акаунт със съгласие. За човек без съгласие остава само IP адресът.
 */
export async function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      signupDeviceHash: true,
      signupFingerprint: true,
      signupIp: true,
      lastLoginIp: true,
      deviceConsentAt: true,
    },
  });
  if (!user) return [];
  const consented = user.deviceConsentAt !== null;
  const devices = consented
    ? await prisma.device.findMany({
        where: { userId },
        select: { cookieHash: true, fingerprintHash: true },
      })
    : [];
  const recentIps = await prisma.loginEvent.findMany({
    where: {
      userId,
      ip: { not: null },
      createdAt: { gte: addDays(new Date(), -90) },
    },
    select: { ip: true },
    distinct: ['ip'],
    take: 50,
  });
  const cookies = [
    ...new Set(
      [consented ? user.signupDeviceHash : null, ...devices.map((d) => d.cookieHash)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const prints = await rare(
    [
      ...new Set(
        [
          consented ? user.signupFingerprint : null,
          ...devices.map((d) => d.fingerprintHash),
        ].filter((v): v is string => Boolean(v)),
      ),
    ],
    async (fp) => [
      ...(
        await prisma.device.findMany({
          where: { fingerprintHash: fp, user: CONSENTED },
          select: { userId: true },
          distinct: ['userId'],
          take: LOOKUP,
        })
      ).map((d) => d.userId),
      ...(
        await prisma.user.findMany({
          where: { signupFingerprint: fp, ...CONSENTED },
          select: { id: true },
          take: LOOKUP,
        })
      ).map((u) => u.id),
    ],
  );
  const ips = await rare(
    [
      ...new Set(
        [user.signupIp, user.lastLoginIp, ...recentIps.map((r) => r.ip)].filter((v): v is string =>
          Boolean(v),
        ),
      ),
    ],
    async (ip) =>
      (
        await prisma.user.findMany({
          where: { OR: [{ signupIp: ip }, { lastLoginIp: ip }] },
          select: { id: true },
          take: LOOKUP,
        })
      ).map((u) => u.id),
  );

  const reasons = new Map<string, Set<'device' | 'hwid' | 'ip'>>();
  const add = (id: string | null, reason: 'device' | 'hwid' | 'ip') => {
    if (!id || id === userId) return;
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id)!.add(reason);
  };
  if (cookies.length) {
    for (const d of await prisma.device.findMany({
      where: { cookieHash: { in: cookies }, user: CONSENTED },
      select: { userId: true },
      take: 200,
    }))
      add(d.userId, 'device');
    for (const u of await prisma.user.findMany({
      where: { signupDeviceHash: { in: cookies }, ...CONSENTED },
      select: { id: true },
      take: 200,
    }))
      add(u.id, 'device');
  }
  if (prints.length) {
    for (const d of await prisma.device.findMany({
      where: { fingerprintHash: { in: prints }, user: CONSENTED },
      select: { userId: true },
      take: 200,
    }))
      add(d.userId, 'hwid');
    for (const u of await prisma.user.findMany({
      where: { signupFingerprint: { in: prints }, ...CONSENTED },
      select: { id: true },
      take: 200,
    }))
      add(u.id, 'hwid');
  }
  if (ips.length) {
    for (const u of await prisma.user.findMany({
      where: { OR: [{ signupIp: { in: ips } }, { lastLoginIp: { in: ips } }] },
      select: { id: true },
      take: 200,
    }))
      add(u.id, 'ip');
  }
  if (reasons.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...reasons.keys()] } },
    select: { id: true, email: true, name: true, plan: true, bannedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const order = { device: 0, hwid: 1, ip: 2 } as const;
  return users.map((u) => ({
    ...u,
    reasons: [...(reasons.get(u.id) ?? [])].sort((a, b) => order[a] - order[b]),
  }));
}

export async function accountAudit(userId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { OR: [{ targetId: userId }, { actorId: userId }] },
    orderBy: { id: 'desc' },
    take,
  });
}
