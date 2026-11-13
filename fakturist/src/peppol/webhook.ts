import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { decryptPeppolHookSecret } from '../auth/keys.js';
import { errorMessage, logger } from '../logger.js';
import { IncomingRegisterError, registerIncoming } from '../incoming/register.js';
import { IncomingError } from '../incoming/check.js';
import type { AccessPoint } from './access-point.js';
import { applyTransmissionEvent } from './transmissions.js';

/**
 * Известията от точката за достъп (SPEC 59). eConnect подписва суровото JSON тяло с HMAC-SHA256 с
 * тайната след „#“ в адреса на известието (своя за всяка фирма) и праща `X-EConnect-Signature:
 * sha256=<hex>`; `sentOn` не по-старо от 5 мин; доставката е „поне веднъж“ → ключ за повторение
 * (`X-EConnect-Delivery` или отпечатъкът на тялото). Обработеното известие не се обработва втори път.
 */
export const MAX_AGE_MS = 5 * 60 * 1000;

const Payload = z.object({
  topic: z.string().min(1).max(60),
  partyId: z.string().min(3).max(120),
  documentId: z.string().min(1).max(120).optional(),
  message: z.string().max(2000).nullish(),
  sentOn: z.string().max(40).optional(),
});

export type WebhookOutcome =
  | { status: 200; result: 'processed' | 'duplicate' | 'ignored' }
  | { status: 400 | 401; result: 'invalid' | 'signature' | 'stale' }
  | { status: 500; result: 'retry' };

export function signatureMatches(rawBody: Buffer, header: string | undefined, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handlePeppolWebhook(input: {
  rawBody: Buffer;
  signature: string | undefined;
  delivery: string | undefined;
  ap: AccessPoint | null;
  now?: Date;
}): Promise<WebhookOutcome> {
  const now = input.now ?? new Date();
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    return { status: 400, result: 'invalid' };
  }
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return { status: 400, result: 'invalid' };
  const event = parsed.data;
  const participant = await prisma.peppolParticipant.findUnique({
    where: { partyId: event.partyId },
  });
  if (!participant?.hookSecretEnc) return { status: 401, result: 'signature' };
  const secret = decryptPeppolHookSecret(participant.hookSecretEnc, participant.organizationId);
  if (!signatureMatches(input.rawBody, input.signature, secret)) {
    return { status: 401, result: 'signature' };
  }
  if (event.sentOn) {
    const sent = Date.parse(event.sentOn);
    if (!Number.isFinite(sent) || Math.abs(now.getTime() - sent) > MAX_AGE_MS) {
      return { status: 401, result: 'stale' };
    }
  }
  const deliveryId =
    input.delivery && /^[\w-]{8,100}$/.test(input.delivery)
      ? input.delivery
      : createHash('sha256').update(input.rawBody).digest('hex');
  const seen = await prisma.peppolEvent.findUnique({ where: { deliveryId } });
  if (seen?.processedAt) return { status: 200, result: 'duplicate' };
  const record = seen
    ? seen
    : await prisma.peppolEvent
        .create({
          data: {
            deliveryId,
            topic: event.topic,
            partyId: event.partyId,
            documentId: event.documentId ?? null,
          },
        })
        .catch(async () => prisma.peppolEvent.findUniqueOrThrow({ where: { deliveryId } }));

  let result: 'processed' | 'ignored' = 'processed';
  try {
    if (event.topic === 'InvoiceReceived' && event.documentId) {
      if (!input.ap) throw new Error('Peppol не е настроен');
      const xml = await input.ap.download({ partyId: event.partyId, documentId: event.documentId });
      try {
        await registerIncoming({
          organizationId: participant.organizationId,
          actorId: null,
          fileName: `peppol-${event.documentId}.xml`.slice(0, 200),
          buffer: Buffer.from(xml, 'utf8'),
          source: 'PEPPOL',
        });
      } catch (error) {
        // Вече е в регистъра или не е фактура — записва се, без нов опит.
        if (!(error instanceof IncomingRegisterError) && !(error instanceof IncomingError)) {
          throw error;
        }
        await prisma.peppolEvent.update({
          where: { id: record.id },
          data: { error: error.message.slice(0, 300) },
        });
      }
    } else if (
      (event.topic === 'InvoiceSent' ||
        event.topic === 'InvoiceSentRetry' ||
        event.topic === 'InvoiceSentError') &&
      event.documentId
    ) {
      const known = await applyTransmissionEvent({
        topic: event.topic,
        providerDocumentId: event.documentId,
        message: event.message ?? null,
        at: now,
      });
      if (!known) result = 'ignored';
    } else {
      result = 'ignored';
    }
  } catch (error) {
    // Тялото е проверено, но обработката падна (мрежа, база) — 500: точката за достъп опитва пак.
    await prisma.peppolEvent.update({
      where: { id: record.id },
      data: { error: errorMessage(error).slice(0, 300) },
    });
    logger.warn({ topic: event.topic, err: errorMessage(error) }, 'Peppol известие — нов опит');
    return { status: 500, result: 'retry' };
  }
  await prisma.peppolEvent.update({
    where: { id: record.id },
    data: { processedAt: now },
  });
  return { status: 200, result };
}
