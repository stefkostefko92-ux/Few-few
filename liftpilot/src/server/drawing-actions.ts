'use server';

// The drawing sets of an installation and what they need: the data of the installation on the project, the logo of the
// company, the issue of a set from a calculation made from a shaft design (a new number YY-NNN of the company and
// year, in the transaction that stores it) and its revisions (same number, revision + 1, with a note). As for the
// calculations: the server rebuilds everything with the running engines and stores the hash of the drawing; the PDF
// is rendered once the answer is sent and kept as issued (drawing-pdf.ts).
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { log } from '@/lib/log';
import { plantSchema } from '@/lib/plant';
import { LOGO_MAX_BYTES, readLogo } from '@/lib/logo';
import { composeFromCalculation, type ComposeError, type Composed } from './drawing-compose';
import { composeFromRoom, type RoomComposed } from './room-compose';
import { keepSetPdfLater } from './drawing-pdf';
import type { TavoleRevision } from '@/lib/tavole/input';
import { initialsSchema, revisionNoteSchema, revisionsSchema, setNumber } from '@/lib/tavole/compose';
import { entry } from './form';

export type DrawingResult = { ok: true; id?: string } | { ok: false; error: string };

/** A set refused inside the issue transaction: thrown, so the counter increment rolls back and no number is lost. */
class ComposeRefused extends Error {
  constructor(readonly code: ComposeError['error']) {
    super(code);
  }
}

async function actor(capability: Capability): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword && can(user, capability) ? user : null;
}

/** Year of an issue in Italy, for the drawing number. */
const yearIt = (d: Date): number => Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Europe/Rome' }).format(d));
const isUniqueViolation = (err: unknown): boolean => typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';

export async function savePlantAction(input: { projectId: unknown; plant: unknown }): Promise<DrawingResult> {
  const user = await actor('projects:edit');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`plant:${user.id}`, 120, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const id = idSchema.safeParse(input.projectId), plant = plantSchema.safeParse(input.plant);
  if (!id.success || !plant.success) return { ok: false, error: 'invalidFields' };
  // an archived installation is read only
  const res = await prisma.project.updateMany({ where: { id: id.data, companyId: user.companyId, archivedAt: null }, data: { plant: plant.data as Prisma.InputJsonValue } });
  if (res.count !== 1) return { ok: false, error: 'notFound' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'PLANT_UPDATED', entity: 'Project', entityId: id.data });
  return { ok: true };
}

export async function uploadLogoAction(fd: FormData): Promise<DrawingResult> {
  const user = await actor('company:edit');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`logo:${user.id}`, 20, 60 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const file = entry(fd, 'logo');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'invalidFields' };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: 'logoTooLarge' };
  const bytes = new Uint8Array(await file.arrayBuffer()), info = readLogo(bytes);
  if (!info) return { ok: false, error: 'logoInvalid' };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const logo = await prisma.$transaction(async (tx) => {
    const l = await tx.companyLogo.create({ data: { companyId: user.companyId, mime: info.mime, data: Buffer.from(bytes), sha256, width: info.width, height: info.height }, select: { id: true } });
    await tx.company.update({ where: { id: user.companyId }, data: { logoId: l.id } });
    return l;
  });
  await audit({ companyId: user.companyId, userId: user.id, action: 'LOGO_UPLOADED', entity: 'Company', entityId: user.companyId, meta: { logoId: logo.id, sha256 } });
  return { ok: true, id: logo.id };
}

export async function removeLogoAction(): Promise<DrawingResult> {
  const user = await actor('company:edit');
  if (!user) return { ok: false, error: 'forbidden' };
  // the logo rows stay: the sets issued with them keep drawing them
  await prisma.company.update({ where: { id: user.companyId }, data: { logoId: null } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'LOGO_REMOVED', entity: 'Company', entityId: user.companyId });
  return { ok: true };
}

/** A set drawn for an issue or a revision: of a whole project's calculation and shaft design, or of a replacement's room. */
type Drawn = (Composed & { calculationId: string; roomDesignId?: undefined }) | RoomComposed;
type Compose = (tx: Prisma.TransactionClient, set: { number: string; issuedAt: Date; author: string; revisions: TavoleRevision[] }) => Promise<Drawn | ComposeError>;

/** The row of a set: what it was made of (one design of the two, a check in the database) and its snapshots. */
const madeOf = (c: Drawn) => ({
  projectId: c.projectId, calculationId: c.calculationId, ...(c.roomDesignId !== undefined ? { roomDesignId: c.roomDesignId } : { shaftDesignId: c.shaftDesignId }),
  logoId: c.logoId, clientLogoId: c.clientLogoId, plant: c.plant, projectData: c.projectData, companyName: c.companyName, sha256: c.sha256, pages: c.pages,
});

/** A first issue: a new number YY-NNN of the company and year, given in the transaction that stores the set. */
async function issueNew(user: SessionUser, author: string, compose: Compose): Promise<DrawingResult> {
  const issuedAt = new Date(), year = yearIt(issuedAt);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await prisma.$transaction(async (tx) => {
        const counter = await tx.drawingCounter.upsert({
          where: { companyId_year: { companyId: user.companyId, year } }, create: { companyId: user.companyId, year, last: 1 }, update: { last: { increment: 1 } },
        });
        const seq = counter.last, number = setNumber(year, seq);
        const c = await compose(tx, { number, issuedAt, author, revisions: [] });
        if (!c.ok) throw new ComposeRefused(c.error);
        const set = await tx.drawingSet.create({
          data: { companyId: user.companyId, userId: user.id, number, year, seq, revision: 0, authorInitials: author, revisions: [], createdAt: issuedAt, ...madeOf(c) },
          select: { id: true },
        });
        return { id: set.id, number, doc: c.doc };
      });
      keepSetPdfLater(out.id, out.doc);
      await audit({ companyId: user.companyId, userId: user.id, action: 'DRAWING_SET_ISSUED', entity: 'DrawingSet', entityId: out.id, meta: { number: out.number } });
      log.info({ userId: user.id, drawingSetId: out.id }, 'drawing set issued');
      return { ok: true, id: out.id };
    } catch (err) {
      if (err instanceof ComposeRefused) return { ok: false, error: err.code };
      // two first issues of the year at once: the counter row was created by the other one; once more
      if (attempt === 0 && isUniqueViolation(err)) continue;
      throw err;
    }
  }
  return { ok: false, error: 'conflict' };
}

export async function issueDrawingSetAction(input: { calculationId: unknown; authorInitials: unknown }): Promise<DrawingResult> {
  const user = await actor('calc:create');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`tavole:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const calcId = idSchema.safeParse(input.calculationId), initials = initialsSchema.safeParse(input.authorInitials);
  if (!calcId.success || !initials.success) return { ok: false, error: 'invalidFields' };
  return issueNew(user, initials.data, async (tx, set) => {
    const c = await composeFromCalculation(tx, user, calcId.data, set);
    return c.ok ? { ...c, calculationId: calcId.data } : c;
  });
}

/** The drawing set of a machine replacement, from its saved machine room. */
export async function issueRoomSetAction(input: { roomDesignId: unknown; authorInitials: unknown }): Promise<DrawingResult> {
  const user = await actor('calc:create');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`tavole:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const roomId = idSchema.safeParse(input.roomDesignId), initials = initialsSchema.safeParse(input.authorInitials);
  if (!roomId.success || !initials.success) return { ok: false, error: 'invalidFields' };
  return issueNew(user, initials.data, (tx, set) => composeFromRoom(tx, user, roomId.data, set));
}

/** A revision of a set (same number, revision + 1, with a note), drawn again from the calculation given (a whole
 *  project) or from the saved machine room given (a replacement). */
export async function reviseDrawingSetAction(input: { drawingSetId: unknown; calculationId?: unknown; roomDesignId?: unknown; note: unknown; authorInitials: unknown }): Promise<DrawingResult> {
  const user = await actor('calc:create');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`tavole:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const setId = idSchema.safeParse(input.drawingSetId), note = revisionNoteSchema.safeParse(input.note), initials = initialsSchema.safeParse(input.authorInitials);
  const calcId = input.calculationId == null ? null : idSchema.safeParse(input.calculationId), roomId = input.roomDesignId == null ? null : idSchema.safeParse(input.roomDesignId);
  if (!setId.success || !note.success || !initials.success || (calcId === null) === (roomId === null) || calcId?.success === false || roomId?.success === false) {
    return { ok: false, error: 'invalidFields' };
  }
  const base = await prisma.drawingSet.findFirst({ where: { id: setId.data, companyId: user.companyId }, select: { year: true, seq: true, number: true, projectId: true, roomDesignId: true } });
  if (!base) return { ok: false, error: 'notFound' };
  // a set stays of its kind: a replacement's is revised from a room, a whole project's from a calculation
  if ((base.roomDesignId !== null) !== (roomId !== null)) return { ok: false, error: 'invalidFields' };
  const compose: Compose = roomId?.data ? ((id) => (tx, set) => composeFromRoom(tx, user, id, set))(roomId.data)
    : ((id) => async (tx, set) => {
      const c = await composeFromCalculation(tx, user, id, set);
      return c.ok ? { ...c, calculationId: id } : c;
    })(calcId?.data ?? '');
  const issuedAt = new Date();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const last = await tx.drawingSet.findFirst({
        where: { companyId: user.companyId, year: base.year, seq: base.seq }, orderBy: { revision: 'desc' }, select: { revision: true, revisions: true },
      });
      const prev = revisionsSchema.safeParse(last?.revisions ?? []);
      if (!last || !prev.success) return { ok: false as const, error: 'notFound' };
      const revision = last.revision + 1;
      const revisions = [...prev.data, { mark: `R${revision}`, text: note.data, date: issuedAt.toISOString() }];
      const c = await compose(tx, { number: base.number, issuedAt, author: initials.data, revisions: revisions.map((r) => ({ mark: r.mark, text: r.text, date: new Date(r.date) })) });
      if (!c.ok) return c;
      // a revision stays on its installation
      if (c.projectId !== base.projectId) return { ok: false as const, error: 'notFound' };
      const set = await tx.drawingSet.create({
        data: {
          companyId: user.companyId, userId: user.id, number: base.number, year: base.year, seq: base.seq, revision, authorInitials: initials.data, revisions,
          createdAt: issuedAt, ...madeOf(c),
        },
        select: { id: true },
      });
      return { ok: true as const, id: set.id, revision, doc: c.doc };
    });
    if (!out.ok) return out;
    keepSetPdfLater(out.id, out.doc);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DRAWING_SET_REVISED', entity: 'DrawingSet', entityId: out.id, meta: { number: base.number, revision: out.revision } });
    return { ok: true, id: out.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'conflict' };
    throw err;
  }
}
