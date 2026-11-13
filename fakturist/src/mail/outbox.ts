import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { errorMessage, logger } from '../logger.js';
import { setting } from '../admin/settings.js';
import { documentPdf } from '../documents/render.js';
import { bgAmount } from '../documents/pdf.js';
import { fromCents } from '../einvoice/decimal.js';
import { inboxReceivedMail } from './templates.js';
import { smtpSender, type MailMessage, type SendMail } from './mailer.js';
import { MINUTE } from '../time.js';

/** Опитите на едно писмо; паузата расте: 1, 5, 15, 60, 240 минути. */
export const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [1, 5, 15, 60, 240, 240];

const TITLES: Record<string, string> = {
  '380': 'Фактура',
  '381': 'Кредитно известие',
  '383': 'Дебитно известие',
  '384': 'Коригираща фактура',
  '386': 'Авансова фактура',
  '389': 'Самофактура',
};

function bgDate(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const InboxPayload = z.object({ inboxEntryId: z.string().min(1) });

/** Писмото за нов документ в шкафчето: текст + PDF + UBL XML. */
async function composeInboxMail(toEmail: string, payload: unknown): Promise<MailMessage> {
  const { inboxEntryId } = InboxPayload.parse(payload);
  const entry = await prisma.inboxEntry.findUniqueOrThrow({
    where: { id: inboxEntryId },
    include: {
      senderOrg: { select: { legalName: true, eik: true, verifiedAt: true } },
      recipientOrg: { select: { legalName: true } },
      document: {
        select: {
          number: true,
          typeCode: true,
          issueDate: true,
          dueDate: true,
          payableCents: true,
          currency: true,
          input: true,
          chainIndex: true,
          sha256: true,
          ublXml: true,
          firm: { select: { legalName: true } },
          mandate: { select: { documentRef: true } },
        },
      },
    },
  });
  const doc = entry.document;
  const number = doc.number ?? '';
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const mail = inboxReceivedMail({
    senderName: entry.senderOrg.legalName,
    senderEik: entry.senderOrg.eik,
    senderVerified: entry.senderOrg.verifiedAt !== null,
    recipientName: entry.recipientOrg.legalName,
    documentTitle: TITLES[doc.typeCode] ?? 'Документ',
    number,
    issueDate: bgDate(doc.issueDate),
    dueDate: doc.dueDate ? bgDate(doc.dueDate) : null,
    amount: `${bgAmount(fromCents(doc.payableCents))} ${doc.currency}`,
    link: `${config().PUBLIC_BASE_URL}/app/o/${entry.recipientOrgId}/shkafche/${entry.id}`,
    signature,
    domain: BRAND.signatureDomain,
  });
  return {
    to: toEmail,
    ...mail,
    attachments: [
      {
        filename: `${number}.pdf`,
        content: await documentPdf(doc),
        contentType: 'application/pdf',
      },
      { filename: `${number}-ubl.xml`, content: doc.ublXml ?? '', contentType: 'application/xml' },
    ],
  };
}

async function compose(kind: string, toEmail: string, payload: unknown): Promise<MailMessage> {
  if (kind === 'inbox.received') return composeInboxMail(toEmail, payload);
  throw new Error(`Непознат вид писмо: ${kind}`);
}

/** Грешката за записа — без имейл адреси (SMTP съобщенията понякога ги съдържат). */
function safeError(error: unknown): string {
  return errorMessage(error)
    .replace(/[^\s@<>]+@[^\s@<>]+/g, '[адрес]')
    .slice(0, 300);
}

/**
 * Праща чакащите писма. Всяко се „заема“ с условен UPDATE (броят опити трябва да е същият) — два процеса
 * не пращат едно писмо два пъти. Без настроена поща не прави нищо: писмата чакат.
 */
export async function processOutbox(
  send: SendMail | null = smtpSender(),
  now: Date = new Date(),
  limit = 20,
): Promise<{ sent: number; failed: number }> {
  if (!send) return { sent: 0, failed: 0 };
  const due = await prisma.notification.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const item of due) {
    const attempt = item.attempts + 1;
    const claimed = await prisma.notification.updateMany({
      where: { id: item.id, status: 'PENDING', attempts: item.attempts },
      data: {
        attempts: attempt,
        nextAttemptAt: new Date(now.getTime() + (BACKOFF_MIN[item.attempts] ?? 240) * MINUTE),
      },
    });
    if (claimed.count !== 1) continue;
    try {
      await send(await compose(item.kind, item.toEmail, item.payload));
      await prisma.notification.update({
        where: { id: item.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      sent += 1;
    } catch (error) {
      const final = attempt >= MAX_ATTEMPTS;
      await prisma.notification.update({
        where: { id: item.id },
        data: { lastError: safeError(error), ...(final ? { status: 'FAILED' } : {}) },
      });
      if (final) failed += 1;
      logger.warn({ notificationId: item.id, attempt, final }, 'писмото не тръгна');
    }
  }
  return { sent, failed };
}

let running = false;

/** Пуска обработката, ако не тече вече (след издаване и на всеки 30 секунди). */
export function kickOutbox(): void {
  if (running) return;
  running = true;
  processOutbox()
    .catch((error: unknown) =>
      logger.error({ err: errorMessage(error) }, 'опашката с писма се провали'),
    )
    .finally(() => {
      running = false;
    });
}

export function startOutboxLoop(): NodeJS.Timeout {
  const timer = setInterval(kickOutbox, 30_000);
  timer.unref();
  return timer;
}
