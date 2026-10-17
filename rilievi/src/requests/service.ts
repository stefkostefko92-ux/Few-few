import type { AccessRequestStatus, Prisma, Role } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { outranks } from '../auth/roles.js';
import { insertAzienda, isUniqueViolation, nameTaken } from '../aziende/service.js';
import { config, mailEnabled } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { accessRequestMail } from '../mail/templates.js';
import { insertInvite, sendInviteMail } from '../services/invites.js';
import { DAY } from '../time.js';
import type { SessionUser } from '../types.js';
import type { RequestInput } from './form.js';

/**
 * Заявките за достъп. Публичната страница само ги записва; разглежда ги MASTER (`requests:manage`) —
 * при „да“ създава фирмата (или избира съществуваща) и кани администратора ѝ с обикновената покана.
 */

/** Заявката се изтрива толкова дни след последната си промяна (maintenance.ts) — пише го и в политиката. */
export const REQUEST_RETENTION_DAYS = 180;
/** Таван за целия портал за денонощие — срещу засипване от много мрежи (таванът по мрежа е в limits.ts). */
export const REQUESTS_PER_DAY = 100;
export const REQUEST_PAGE_SIZE = 25;

const ID = /^[a-z0-9]{20,40}$/;

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export type SubmitResult = { ok: true; id: string } | { ok: false; error: 'busy' };

/**
 * Нова заявка — или обновена, ако от същия имейл вече чака една (без дубли в списъка). Отговорът към
 * посетителя е един и същ и в двата случая; MASTER получава писмо само за новата.
 */
export async function submitAccessRequest(input: RequestInput): Promise<SubmitResult> {
  const lastDay = await prisma.accessRequest.count({
    where: { createdAt: { gte: new Date(Date.now() - DAY) } },
  });
  if (lastDay >= REQUESTS_PER_DAY) return { ok: false, error: 'busy' };
  const saved = await prisma.$transaction(async (tx) => {
    // Две пращания от един имейл наведнъж (двоен клик) се редят едно след друго: един ред, едно писмо.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 0))`;
    const pending = await tx.accessRequest.findFirst({
      where: { email: input.email, status: 'NEW' },
      select: { id: true },
    });
    const row = pending
      ? await tx.accessRequest.update({
          where: { id: pending.id },
          data: input,
          select: { id: true },
        })
      : await tx.accessRequest.create({ data: input, select: { id: true } });
    await writeAudit(
      {
        actorId: null,
        action: pending ? 'ACCESS_REQUEST_UPDATE' : 'ACCESS_REQUEST',
        aziendaId: null,
        targetType: 'request',
        targetId: row.id,
      },
      tx,
    );
    return { id: row.id, created: pending === null };
  });
  if (saved.created) {
    notifyMasters(saved.id, input.company).catch((error: unknown) => {
      logger.error({ err: errorMessage(error) }, 'известието за заявката не тръгна');
    });
  }
  return { ok: true, id: saved.id };
}

/** Писмо до всеки активен MASTER — само ако има поща; иначе заявката чака в „Richieste“. */
async function notifyMasters(id: string, company: string): Promise<void> {
  if (!mailEnabled()) return;
  const masters = await prisma.user.findMany({
    where: { master: true, deactivatedAt: null },
    select: { email: true },
  });
  const link = `${config().PUBLIC_BASE_URL}/richieste/${id}`;
  for (const master of masters) {
    await sendMail(accessRequestMail({ to: master.email, company, link }));
  }
}

export const REQUEST_FILTERS = ['NEW', 'ACCEPTED', 'REJECTED', 'ALL'] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function isRequestFilter(value: unknown): value is RequestFilter {
  return typeof value === 'string' && (REQUEST_FILTERS as readonly string[]).includes(value);
}

/** Страница от списъка (най-новите отгоре) и броят по състояние — за разделите. */
export async function listAccessRequests(filter: RequestFilter, page: number) {
  const where: Prisma.AccessRequestWhereInput = filter === 'ALL' ? {} : { status: filter };
  const [total, rows, grouped] = await Promise.all([
    prisma.accessRequest.count({ where }),
    prisma.accessRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * REQUEST_PAGE_SIZE,
      take: REQUEST_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        city: true,
        teamSize: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.accessRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts: Record<AccessRequestStatus, number> = { NEW: 0, ACCEPTED: 0, REJECTED: 0 };
  for (const group of grouped) counts[group.status] = group._count._all;
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE)),
    counts,
  };
}

export function getAccessRequest(id: string) {
  if (!isRequestId(id)) return Promise.resolve(null);
  return prisma.accessRequest.findUnique({
    where: { id },
    include: {
      azienda: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
      invite: { select: { acceptedAt: true, revokedAt: true, expiresAt: true } },
    },
  });
}

/** Новите заявки — за брояча до „Richieste“ в лентата на MASTER. */
export function countNewRequests(): Promise<number> {
  return prisma.accessRequest.count({ where: { status: 'NEW' } });
}

export interface AcceptInput {
  /** Съществуваща активна фирма — или null: нова фирма с името `aziendaName`. */
  aziendaId: string | null;
  aziendaName: string;
  email: string;
  name: string;
  role: Role;
}

export type AcceptError =
  'notFound' | 'decided' | 'userExists' | 'nameTaken' | 'azienda' | 'roleNotAllowed';

export type AcceptResult =
  { ok: true; link: string; mail: MailResult; email: string } | { ok: false; error: AcceptError };

/** Отказът на приемането — вдига се вътре в транзакцията, за да я върне цялата. */
class AcceptFailure extends Error {
  constructor(readonly code: AcceptError) {
    super(code);
  }
}

/**
 * „Да“ в една транзакция: заявката се заключва (NEW → ACCEPTED — втори Master чака реда и после вижда, че
 * вече не е нова), фирмата (нова или съществуваща), поканата и одитът. Каквото и да не стане, нищо не
 * остава — нито фирма без покана, нито приета заявка без покана. Писмото тръгва след записа.
 */
export async function acceptAccessRequest(
  actor: SessionUser,
  id: string,
  input: AcceptInput,
): Promise<AcceptResult> {
  if (!isRequestId(id)) return { ok: false, error: 'notFound' };
  // Заявките решава само MASTER (`requests:manage`); като всяка покана — роля под неговата (MASTER не се кани).
  if (!actor.master || !outranks('MASTER', input.role))
    return { ok: false, error: 'roleNotAllowed' };
  try {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.accessRequest.updateMany({
        where: { id, status: 'NEW' },
        data: { status: 'ACCEPTED', decidedAt: new Date(), decidedById: actor.id },
      });
      if (claimed.count === 0) {
        throw new AcceptFailure(
          (await tx.accessRequest.count({ where: { id } })) ? 'decided' : 'notFound',
        );
      }
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new AcceptFailure('userExists');
      }
      let azienda: { id: string; name: string } | null;
      if (input.aziendaId) {
        azienda = await tx.azienda.findFirst({
          where: { id: input.aziendaId, deactivatedAt: null },
          select: { id: true, name: true },
        });
        if (!azienda) throw new AcceptFailure('azienda');
      } else {
        if (await nameTaken(input.aziendaName, undefined, tx)) throw new AcceptFailure('nameTaken');
        const created = await insertAzienda(tx, actor, { name: input.aziendaName, logo: null });
        azienda = { id: created.id, name: input.aziendaName };
      }
      const { invite, token } = await insertInvite(tx, actor, {
        email: input.email,
        name: input.name,
        role: input.role,
        aziendaId: azienda.id,
      });
      await tx.accessRequest.update({
        where: { id },
        data: { aziendaId: azienda.id, inviteId: invite.id },
      });
      await writeAudit(
        {
          actorId: actor.id,
          action: 'ACCESS_REQUEST_ACCEPT',
          aziendaId: azienda.id,
          targetType: 'request',
          targetId: id,
        },
        tx,
      );
      return { aziendaName: azienda.name, token };
    });
    const { link, mail } = await sendInviteMail(actor, input, done.aziendaName, done.token);
    return { ok: true, link, mail, email: input.email };
  } catch (error) {
    if (error instanceof AcceptFailure) return { ok: false, error: error.code };
    // Същото име, записано междувременно от друг (уникалният индекс на името) — транзакцията е върната.
    if (isUniqueViolation(error)) return { ok: false, error: 'nameTaken' };
    throw error;
  }
}

/** „Не“: само новата заявка се отказва; на заявителя не се пише (адресът не е проверен). */
export async function rejectAccessRequest(actor: SessionUser, id: string): Promise<boolean> {
  if (!isRequestId(id)) return false;
  return prisma.$transaction(async (tx) => {
    const done = await tx.accessRequest.updateMany({
      where: { id, status: 'NEW' },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedById: actor.id },
    });
    if (done.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'ACCESS_REQUEST_REJECT',
        aziendaId: null,
        targetType: 'request',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}

/** Изтриване по всяко време (и по искане на заявителя — GDPR). Поканата и фирмата не се пипат. */
export async function deleteAccessRequest(actor: SessionUser, id: string): Promise<boolean> {
  if (!isRequestId(id)) return false;
  return prisma.$transaction(async (tx) => {
    const done = await tx.accessRequest.deleteMany({ where: { id } });
    if (done.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'ACCESS_REQUEST_DELETE',
        aziendaId: null,
        targetType: 'request',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}

/** Срокът: заявка без промяна от REQUEST_RETENTION_DAYS дни се изтрива. */
export async function purgeOldRequests(now = Date.now()): Promise<number> {
  const done = await prisma.accessRequest.deleteMany({
    where: { updatedAt: { lt: new Date(now - REQUEST_RETENTION_DAYS * DAY) } },
  });
  return done.count;
}
