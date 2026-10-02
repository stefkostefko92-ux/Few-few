import 'server-only';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import type { ProjectKind } from '@/lib/schemas';
import { DESIGN_SELECT } from './drawing-compose';

// Reads, always scoped to the company of the signed-in user: an id from another company is "not found".

export function listProjects(user: SessionUser, archived: boolean, kind: ProjectKind | null = null) {
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: archived ? { not: null } : null, ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true, kind: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true, archivedAt: true,
      _count: { select: { calculations: true } },
      calculations: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true } },
    },
  });
}

export function getProject(user: SessionUser, id: string) {
  return prisma.project.findFirst({
    where: { id, companyId: user.companyId },
    include: { createdBy: { select: { name: true } }, clientLogo: { select: { id: true, mime: true, data: true } } },
  });
}

export function listCalculations(user: SessionUser, projectId: string) {
  return prisma.calculation.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, sha256: true, createdAt: true, engineVersion: true, shaftDesignId: true,
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
      shaftDesign: { select: { id: true, label: true, summary: true, inputs: true, source: true, sha256: true, engineVersion: true, profileId: true, createdAt: true, user: { select: { name: true } } } },
      // the one form it was made from, if any: the documents mark what the software filled in
      liftDesign: { select: { inputs: true } },
    },
  });
}

export function listShaftDesigns(user: SessionUser, projectId: string) {
  return prisma.shaftDesign.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, sha256: true, createdAt: true, source: true, user: { select: { name: true } } },
  });
}

export function getShaftDesign(user: SessionUser, id: string) {
  return prisma.shaftDesign.findFirst({
    where: { id, companyId: user.companyId },
    include: { project: true, user: { select: { name: true } }, _count: { select: { calculations: true } } },
  });
}

export function listUsers(user: SessionUser) {
  return prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, mustChangePassword: true, emailVerifiedAt: true },
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
  const [users, projects, calculations, designs, companies] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set([...actors, ...ids('User')])] } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: ids('Project') }, companyId: user.companyId }, select: { id: true, name: true } }),
    prisma.calculation.findMany({ where: { id: { in: ids('Calculation') }, companyId: user.companyId }, select: { id: true, label: true, project: { select: { name: true } } } }),
    prisma.shaftDesign.findMany({ where: { id: { in: ids('ShaftDesign') }, companyId: user.companyId }, select: { id: true, label: true, project: { select: { name: true } } } }),
    prisma.company.findMany({ where: { id: { in: ids('Company') } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([
    ...users.map((u) => [u.id, u.name] as const),
    ...projects.map((p) => [p.id, p.name] as const),
    ...[...calculations, ...designs].map((c) => [c.id, c.label ? `${c.project.name} · ${c.label}` : c.project.name] as const),
    ...companies.map((c) => [c.id, c.name] as const),
  ]);
  return { rows, names };
}

export function listDrawingSets(user: SessionUser, projectId: string) {
  return prisma.drawingSet.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: [{ year: 'desc' }, { seq: 'desc' }, { revision: 'desc' }],
    take: 200,
    select: { id: true, number: true, revision: true, pages: true, createdAt: true, calculationId: true, authorInitials: true, user: { select: { name: true } } },
  });
}

export function getDrawingSet(user: SessionUser, id: string) {
  return prisma.drawingSet.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      project: { select: { id: true, name: true, archivedAt: true } },
      user: { select: { name: true } },
      logo: { select: { mime: true, data: true } },
      clientLogo: { select: { mime: true, data: true } },
      calculation: { select: { id: true, label: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, liftDesign: { select: { inputs: true } } } },
      shaftDesign: { select: DESIGN_SELECT },
    },
  });
}

/** The other revisions of the same drawing number (for the history on a set's page). */
export function listRevisions(user: SessionUser, year: number, seq: number) {
  return prisma.drawingSet.findMany({
    where: { companyId: user.companyId, year, seq },
    orderBy: { revision: 'asc' },
    select: { id: true, revision: true, createdAt: true, revisions: true },
  });
}

export function getCompanyLogo(user: SessionUser) {
  return prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true, logo: { select: { id: true, mime: true, data: true, width: true, height: true, createdAt: true } } },
  });
}

export function listLiftDesigns(user: SessionUser, projectId: string) {
  return prisma.liftDesign.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, createdAt: true, engineVersion: true, user: { select: { name: true } } },
  });
}

/** A saved lift design with what the page needs: the form as entered, the records made from it and their hashes. */
export function getLiftDesign(user: SessionUser, id: string) {
  return prisma.liftDesign.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      project: { select: { id: true, name: true, archivedAt: true } },
      user: { select: { name: true } },
      calculation: { select: { id: true, sha256: true, engineVersion: true } },
      shaftDesign: { select: { id: true, sha256: true, engineVersion: true } },
    },
  });
}

/** The latest lift design of an installation (the project page shows it in 3D). */
export function latestLiftDesign(user: SessionUser, projectId: string) {
  return prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, inputs: true, label: true, createdAt: true, calculationId: true, shaftDesignId: true, verdict: true },
  });
}
