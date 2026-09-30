import 'server-only';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

// Reads, always scoped to the company of the signed-in user: an id from another company is "not found".

export function listProjects(user: SessionUser, archived: boolean) {
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: archived ? { not: null } : null },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true, archivedAt: true,
      _count: { select: { calculations: true } },
      calculations: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true } },
    },
  });
}

export function getProject(user: SessionUser, id: string) {
  return prisma.project.findFirst({ where: { id, companyId: user.companyId }, include: { createdBy: { select: { name: true } } } });
}

export function listCalculations(user: SessionUser, projectId: string) {
  return prisma.calculation.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, sha256: true, createdAt: true, engineVersion: true,
      user: { select: { name: true } }, _count: { select: { reviews: true } },
    },
  });
}

export function getCalculation(user: SessionUser, id: string) {
  return prisma.calculation.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      project: true,
      user: { select: { name: true } },
      reviews: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true, role: true } } } },
    },
  });
}

export function listUsers(user: SessionUser) {
  return prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, mustChangePassword: true },
  });
}

export function listCompanies() {
  return prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, createdAt: true, _count: { select: { users: true, projects: true, calculations: true } } },
  });
}

export function listAudit(user: SessionUser) {
  return prisma.auditLog.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: 'desc' }, take: 300 });
}

/**
 * The same events with readable names: who acted, and the installation, calculation, user or company touched.
 * The ids come only from this company's log; installations and calculations are looked up in this company only.
 */
export async function listAuditNamed(user: SessionUser) {
  const rows = await listAudit(user);
  const ids = (entity: string): string[] => [...new Set(rows.filter((r) => r.entity === entity).map((r) => r.entityId).filter((x): x is string => !!x))];
  const actors = rows.map((r) => r.userId).filter((x): x is string => !!x);
  const [users, projects, calculations, companies] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set([...actors, ...ids('User')])] } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: ids('Project') }, companyId: user.companyId }, select: { id: true, name: true } }),
    prisma.calculation.findMany({ where: { id: { in: ids('Calculation') }, companyId: user.companyId }, select: { id: true, label: true, project: { select: { name: true } } } }),
    prisma.company.findMany({ where: { id: { in: ids('Company') } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([
    ...users.map((u) => [u.id, u.name] as const),
    ...projects.map((p) => [p.id, p.name] as const),
    ...calculations.map((c) => [c.id, c.label ? `${c.project.name} · ${c.label}` : c.project.name] as const),
    ...companies.map((c) => [c.id, c.name] as const),
  ]);
  return { rows, names };
}
