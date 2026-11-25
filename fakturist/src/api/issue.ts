import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError, type OrgAccess } from '../auth/guards.js';
import type { MemberRole } from '../auth/roles.js';
import { sha256 } from '../ledger/chain.js';
import { kickOutbox } from '../mail/outbox.js';
import {
  issueInTx,
  issueSettings,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { isPdfLanguage } from '../documents/pdf-labels.js';
import type { ApiPrincipal } from './keys.js';
import { DOCUMENT_ROW_SELECT, documentJson } from './serialize.js';

/**
 * POST /api/v1/documents (SPEC 53): издаване от името на създателя на ключа с правото му към момента;
 * `Idempotency-Key` се записва в транзакцията на издаването — повторена или едновременна заявка връща
 * същия документ, номерът не изгаря. Номерът и доставчикът — само от сървъра.
 */
function fail(res: Response, status: number, error: string, extra: object = {}): void {
  res.status(status).json({ error, ...extra });
}

/** Достъпът на създателя на ключа: пряк член на фирмата (ролята му към момента). */
async function accessOf(api: ApiPrincipal): Promise<{ access: OrgAccess; actorId: string } | null> {
  if (!api.createdById) return null;
  const member = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: api.createdById, organizationId: api.organizationId },
    },
    select: { role: true },
  });
  if (!member) return null;
  return {
    access: {
      organizationId: api.organizationId,
      role: member.role as MemberRole,
      viaFirmId: null,
      mandateId: null,
    },
    actorId: api.createdById,
  };
}

export async function issueHandler(req: Request, res: Response): Promise<void> {
  const api = req.api!;
  const idempotencyKey = req.get('idempotency-key');
  if (idempotencyKey !== undefined && !/^[A-Za-z0-9_.:-]{8,100}$/.test(idempotencyKey)) {
    return fail(res, 400, 'idempotencyKey');
  }
  const parsed = IssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, 'invalid', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const requestHash = sha256(JSON.stringify(req.body));
  const replay = async () => {
    const seen = await prisma.apiIdempotency.findUnique({
      where: { apiKeyId_key: { apiKeyId: api.keyId, key: idempotencyKey! } },
      include: { document: { select: DOCUMENT_ROW_SELECT } },
    });
    if (!seen) return false;
    if (seen.requestHash !== requestHash) {
      fail(res, 422, 'idempotencyMismatch');
      return true;
    }
    res
      .status(200)
      .set('Idempotent-Replayed', 'true')
      .json({ data: documentJson(seen.document) });
    return true;
  };
  if (idempotencyKey && (await replay())) return;
  const actor = await accessOf(api);
  if (!actor) return fail(res, 403, 'access');
  // Чужда или несъществуваща серия — 422, не „изчерпана“ (UPDATE-ът в издаването не ги различава).
  const series = await prisma.documentSeries.findFirst({
    where: { id: parsed.data.seriesId, organizationId: api.organizationId },
    select: { id: true },
  });
  if (!series) return fail(res, 422, 'series');
  const settings = await issueSettings();
  try {
    const issued = await prisma.$transaction(async (tx) => {
      const language = (req.body as { pdfLanguage?: unknown }).pdfLanguage;
      const result = await issueInTx(
        tx,
        actor.access,
        actor.actorId,
        parsed.data,
        { pdfLanguage: isPdfLanguage(language) ? language : 'bg' },
        settings,
      );
      if (idempotencyKey) {
        await tx.apiIdempotency.create({
          data: { apiKeyId: api.keyId, key: idempotencyKey, requestHash, documentId: result.id },
        });
      }
      await audit(tx, {
        actorId: actor.actorId,
        organizationId: api.organizationId,
        action: 'api.document.issued',
        targetType: 'Document',
        targetId: result.id,
        details: { apiKeyId: api.keyId, number: result.number },
      });
      return result;
    });
    kickOutbox();
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: issued.id },
      select: DOCUMENT_ROW_SELECT,
    });
    res.status(201).json({
      data: documentJson(doc),
      warnings: issued.warnings.map((w) => ({ rule: w.rule, path: w.path, message: w.message })),
    });
  } catch (error) {
    // Същият ключ, едновременно: втората транзакция пада, номерът не изгаря — връща се първият.
    if (
      idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (await replay())
    ) {
      return;
    }
    if (error instanceof IssueRejected) {
      return fail(res, 422, 'rejected', {
        issues: error.issues.map((i) => ({ rule: i.rule, path: i.path, message: i.message })),
      });
    }
    if (error instanceof SeriesExhausted) return fail(res, 409, 'seriesExhausted');
    if (error instanceof HttpError && error.status === 404) return fail(res, 403, 'access');
    throw error;
  }
}
