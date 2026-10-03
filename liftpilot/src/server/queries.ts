import 'server-only';
import { prisma } from '@/lib/db';
import { companyAccess } from '@/lib/billing';
import { BILLING_SELECT } from '@/lib/billing-access';
import { billingConfigured } from '@/lib/billing-config';
import type { SessionUser } from '@/lib/auth';
import { usableLogo, type LogoMime } from '@/lib/logo';
import { idSchema, type ProjectKind } from '@/lib/schemas';
import { DESIGN_SELECT } from './drawing-compose';

// Reads, always scoped to the company of the signed-in user: an id from another company is "not found".

/** The engine versions a lift design's records were saved with (records.ts, `outdated`). */
const LIFT_VERSIONS = { engineVersion: true, calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true } } } as const;

export function listProjects(user: SessionUser, archived: boolean, kind: ProjectKind | null = null) {
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: archived ? { not: null } : null, ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true, kind: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true, archivedAt: true,
      _count: { select: { calculations: true } },
      calculations: {
        orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, engineVersion: true, shaftDesign: { select: { engineVersion: true } } },
      },
      // a whole project's result is its latest lift design's (the test's verdict, its parts only)
      liftDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, ...LIFT_VERSIONS } },
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
      shaftDesign: { select: { engineVersion: true } }, liftDesign: { select: { id: true, engineVersion: true } },
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
      liftDesign: { select: { id: true, inputs: true, engineVersion: true } },
    },
  });
}

export function listShaftDesigns(user: SessionUser, projectId: string) {
  return prisma.shaftDesign.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, sha256: true, createdAt: true, source: true, engineVersion: true,
      liftDesign: { select: { id: true } }, user: { select: { name: true } },
    },
  });
}

export function getShaftDesign(user: SessionUser, id: string) {
  return prisma.shaftDesign.findFirst({
    where: { id, companyId: user.companyId },
    include: { project: true, user: { select: { name: true } }, liftDesign: { select: { id: true } }, _count: { select: { calculations: true } } },
  });
}

export function listUsers(user: SessionUser) {
  return prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, mustChangePassword: true, emailVerifiedAt: true },
  });
}

/** The platform's companies with their subscription's state now. */
export async function listCompanies() {
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, createdAt: true, ...BILLING_SELECT,
      _count: { select: { users: true, projects: true, calculations: true } } },
  });
  const now = new Date(), on = billingConfigured();
  return rows.map((c) => ({ ...c, access: companyAccess(c, now, on) }));
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
    select: {
      id: true, number: true, revision: true, pages: true, createdAt: true, calculationId: true, roomDesignId: true, authorInitials: true, user: { select: { name: true } },
    },
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
      calculation: { select: { id: true, label: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, collaudo: true, liftDesign: { select: { inputs: true, engineVersion: true } } } },
      shaftDesign: { select: DESIGN_SELECT },
      roomDesign: { select: ROOM_SELECT },
      // whether its PDF is kept as issued (not the bytes)
      pdf: { select: { sha256: true } },
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

/** The letterhead of the company's documents: its name, city and current logo (one the renderers may decode, lib/logo.ts:
 *  type and pixels checked again, an older oversized upload left out), in base64. */
export async function getLetterhead(user: SessionUser): Promise<{ company: string; companyCity: string | null; logo: { mime: LogoMime; data: string } | null }> {
  const c = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, city: true, logo: { select: { mime: true, data: true } } } });
  const ok = usableLogo(c?.logo);
  return { company: c?.name ?? user.companyName, companyCity: c?.city ?? null, logo: ok ? { mime: ok.mime, data: Buffer.from(ok.data).toString('base64') } : null };
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
    select: { id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, createdAt: true, user: { select: { name: true } }, ...LIFT_VERSIONS },
  });
}

/** A saved lift design with what the page needs: the form as entered, the records made from it and their hashes. */
export function getLiftDesign(user: SessionUser, id: string) {
  return prisma.liftDesign.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      project: { select: { id: true, name: true, archivedAt: true, plant: true } },
      user: { select: { name: true } },
      calculation: { select: { id: true, sha256: true, engineVersion: true } },
      shaftDesign: { select: { id: true, sha256: true, engineVersion: true } },
    },
  });
}

const OUTCOME = { createdAt: true, verdict: true, failCount: true, warnCount: true } as const;

/** The result of the record a newer one was made again from (?da=<id>, «Aggiorna con il software attuale»), on the same
 *  installation of the company: for the banner that says whether the result changed. */
export function refreshedFrom(user: SessionUser, kind: 'calculation' | 'liftDesign' | 'roomDesign', id: unknown, projectId: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return Promise.resolve(null);
  const where = { id: parsed.data, companyId: user.companyId, projectId };
  return kind === 'calculation' ? prisma.calculation.findFirst({ where, select: OUTCOME })
    : kind === 'liftDesign' ? prisma.liftDesign.findFirst({ where, select: OUTCOME }) : prisma.roomDesign.findFirst({ where, select: OUTCOME });
}

/** The latest lift design of an installation (the project page shows it in 3D). */
export function latestLiftDesign(user: SessionUser, projectId: string) {
  return prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, inputs: true, label: true, createdAt: true, calculationId: true, shaftDesignId: true, verdict: true, ...LIFT_VERSIONS },
  });
}

/** What a saved machine room of a replacement needs to be derived again and named. */
export const ROOM_SELECT = { id: true, label: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, summary: true, user: { select: { name: true } } } as const;

export function listRoomDesigns(user: SessionUser, projectId: string) {
  return prisma.roomDesign.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, label: true, verdict: true, failCount: true, warnCount: true, summary: true, createdAt: true, calculationId: true, engineVersion: true,
      calculation: { select: { engineVersion: true } }, user: { select: { name: true } },
    },
  });
}

/** The latest machine room surveyed on a calculation of the company (one its update could not carry over). */
export function latestRoomOf(user: SessionUser, calculationId: string) {
  return prisma.roomDesign.findFirst({ where: { calculationId, companyId: user.companyId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
}

/** A saved machine room with its calculation (values, hash, the standards chosen) and its project. */
export function getRoomDesign(user: SessionUser, id: string) {
  return prisma.roomDesign.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      project: true,
      user: { select: { name: true } },
      calculation: { select: { id: true, label: true, inputs: true, sha256: true, engineVersion: true, profileId: true, createdAt: true, collaudo: true, summary: true, user: { select: { name: true } } } },
    },
  });
}

