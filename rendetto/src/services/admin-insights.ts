import type { Plan } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * Разследването на акаунт в панела: входове, откъде влиза (IP и държава), свързани акаунти по
 * устройство, HWID и IP, одит. Само четене — действията са в admin-actions/admin-security.
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
    where: { userId, outcome: { in: ['SUCCESS', 'MFA_RECOVERY'] } },
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

/**
 * Други акаунти от същото устройство (бисквитка), същия хардуерен отпечатък (HWID) или същото IP.
 * Устройството и HWID са силни сигнали за повторен тестов период; общото IP е слаб (офис, мобилен оператор).
 */
export async function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { signupDeviceHash: true, signupFingerprint: true, signupIp: true, lastLoginIp: true },
  });
  if (!user) return [];
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { cookieHash: true, fingerprintHash: true },
  });
  const recentIps = await prisma.loginEvent.findMany({
    where: {
      userId,
      ip: { not: null },
      createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
    },
    select: { ip: true },
    distinct: ['ip'],
    take: 50,
  });
  const cookies = [
    ...new Set(
      [user.signupDeviceHash, ...devices.map((d) => d.cookieHash)].filter((v): v is string =>
        Boolean(v),
      ),
    ),
  ];
  const prints = [
    ...new Set(
      [user.signupFingerprint, ...devices.map((d) => d.fingerprintHash)].filter((v): v is string =>
        Boolean(v),
      ),
    ),
  ];
  const ips = [
    ...new Set(
      [user.signupIp, user.lastLoginIp, ...recentIps.map((r) => r.ip)].filter((v): v is string =>
        Boolean(v),
      ),
    ),
  ];

  const reasons = new Map<string, Set<'device' | 'hwid' | 'ip'>>();
  const add = (id: string | null, reason: 'device' | 'hwid' | 'ip') => {
    if (!id || id === userId) return;
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id)!.add(reason);
  };
  if (cookies.length) {
    for (const d of await prisma.device.findMany({
      where: { cookieHash: { in: cookies } },
      select: { userId: true },
    }))
      add(d.userId, 'device');
    for (const u of await prisma.user.findMany({
      where: { signupDeviceHash: { in: cookies } },
      select: { id: true },
    }))
      add(u.id, 'device');
  }
  if (prints.length) {
    for (const d of await prisma.device.findMany({
      where: { fingerprintHash: { in: prints } },
      select: { userId: true },
    }))
      add(d.userId, 'hwid');
    for (const u of await prisma.user.findMany({
      where: { signupFingerprint: { in: prints } },
      select: { id: true },
    }))
      add(u.id, 'hwid');
  }
  if (ips.length) {
    for (const u of await prisma.user.findMany({
      where: { OR: [{ signupIp: { in: ips } }, { lastLoginIp: { in: ips } }] },
      select: { id: true },
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
