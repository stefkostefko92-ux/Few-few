import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { MINUTE } from '../time.js';
import { AccessPointError, type AccessPoint } from './access-point.js';
import { PeppolError } from './participants.js';
import { peppolAllowed } from './settings.js';

/**
 * Изпращането през Peppol (SPEC 58): ред в транзакцията на издаването → работникът го взема с условен
 * запис (заемане за 10 мин), качва UBL-а с нашия UUID (повторение → „вече прието“) и записва резултата.
 * Временна грешка → нов опит след 2^n минути (до 6 ч), до 8 опита; постоянна → FAILED. Окончателният
 * статус (изпратено / нов опит / грешка) идва от известията на точката за достъп.
 */
export const MAX_ATTEMPTS = 8;
const LEASE_MS = 10 * MINUTE;

export async function queueTransmission(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    documentId: string;
    receiverPartyId: string;
    actorId: string | null;
  },
): Promise<void> {
  const participant = await tx.peppolParticipant.findUnique({
    where: { organizationId: input.organizationId },
    select: { partyId: true, status: true },
  });
  if (participant?.status !== 'ACTIVE') throw new PeppolError('notActive');
  if (!(await peppolAllowed(input.organizationId, { db: tx }))) {
    throw new PeppolError('notAvailable');
  }
  await tx.peppolTransmission.create({
    data: {
      organizationId: input.organizationId,
      documentId: input.documentId,
      senderPartyId: participant.partyId,
      receiverPartyId: input.receiverPartyId,
      providerDocumentId: randomUUID(),
      createdById: input.actorId,
    },
  });
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'peppol.queued',
    targetType: 'Document',
    targetId: input.documentId,
    details: { receiver: input.receiverPartyId },
  });
}

function backoff(attempts: number): number {
  return Math.min(2 ** attempts * MINUTE, 6 * 60 * MINUTE);
}

/** Праща чакащите; връща колко са приети от точката за достъп. */
export async function sendDueTransmissions(
  ap: AccessPoint | null,
  now = new Date(),
  limit = 20,
): Promise<number> {
  if (!ap) return 0;
  const due = await prisma.peppolTransmission.findMany({
    where: { status: 'QUEUED', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true, attempts: true, organizationId: true },
  });
  let accepted = 0;
  for (const row of due) {
    // Изключена функция (флаг, план, краят на пробата) — редът чака, нищо не тръгва към доставчика.
    if (!(await peppolAllowed(row.organizationId))) continue;
    // Заемане: само един процес взема реда (броят опити трябва да е същият).
    const claimed = await prisma.peppolTransmission.updateMany({
      where: { id: row.id, status: 'QUEUED', attempts: row.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count !== 1) continue;
    const item = await prisma.peppolTransmission.findUniqueOrThrow({
      where: { id: row.id },
      include: { document: { select: { ublXml: true, status: true } } },
    });
    try {
      if (!item.document.ublXml) throw new AccessPointError('rejected', 'Документът няма UBL');
      await ap.send({
        senderPartyId: item.senderPartyId,
        documentId: item.providerDocumentId,
        ubl: item.document.ublXml,
      });
      // Само ако редът още е наш (QUEUED): известие, дошло докато заявката тече, печели.
      await prisma.peppolTransmission.updateMany({
        where: { id: item.id, status: 'QUEUED' },
        data: { status: 'ACCEPTED', lastError: null },
      });
      accepted += 1;
    } catch (error) {
      const retry =
        error instanceof AccessPointError ? error.retryable : true; /* неочаквано — пак */
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Неизвестна грешка';
      const exhausted = item.attempts >= MAX_ATTEMPTS;
      await prisma.peppolTransmission.updateMany({
        where: { id: item.id, status: 'QUEUED' },
        data:
          retry && !exhausted
            ? {
                status: 'QUEUED',
                lastError: message,
                nextAttemptAt: new Date(now.getTime() + backoff(item.attempts)),
              }
            : { status: 'FAILED', lastError: message },
      });
    }
  }
  return accepted;
}

/**
 * Статусът от известие на точката за достъп; непознат документ — false. Подписът удостоверява само
 * `partyId` на известието, затова документът се търси само сред изпращанията на този подател.
 */
export async function applyTransmissionEvent(input: {
  topic: 'InvoiceSent' | 'InvoiceSentRetry' | 'InvoiceSentError';
  partyId: string;
  providerDocumentId: string;
  message: string | null;
  at: Date;
}): Promise<boolean> {
  const row = await prisma.peppolTransmission.findFirst({
    where: { providerDocumentId: input.providerDocumentId, senderPartyId: input.partyId },
    select: { id: true, organizationId: true, documentId: true, status: true },
  });
  if (!row) return false;
  // Изпратеното остава изпратено — закъсняло „нов опит“ не го връща назад.
  if (row.status === 'SENT' && input.topic !== 'InvoiceSentError') return true;
  const data =
    input.topic === 'InvoiceSent'
      ? { status: 'SENT' as const, sentAt: input.at, lastError: null }
      : input.topic === 'InvoiceSentRetry'
        ? { status: 'RETRYING' as const, lastError: input.message?.slice(0, 500) ?? null }
        : { status: 'FAILED' as const, lastError: input.message?.slice(0, 500) ?? 'Грешка' };
  await prisma.$transaction(async (tx) => {
    await tx.peppolTransmission.update({ where: { id: row.id }, data });
    await audit(tx, {
      actorId: null,
      organizationId: row.organizationId,
      action: `peppol.${input.topic}`,
      targetType: 'Document',
      targetId: row.documentId,
    });
  });
  return true;
}
