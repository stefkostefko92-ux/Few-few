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
