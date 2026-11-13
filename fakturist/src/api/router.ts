import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { HttpError, type OrgAccess } from '../auth/guards.js';
import type { MemberRole } from '../auth/roles.js';
import { MINUTE } from '../time.js';
import { sha256 } from '../ledger/chain.js';
import { kickOutbox } from '../mail/outbox.js';
import {
  issueInTx,
  issueSettings,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { DOWNLOAD_SELECT, sendDocumentFile } from '../routes/app-shared.js';
import { requestRateKey } from '../http/ip.js';
import { authenticateApiKey, type ApiPrincipal, type ApiScope } from './keys.js';
import { DOCUMENT_ROW_SELECT, documentJson } from './serialize.js';

/**
 * REST API v1 (SPEC 53): `Authorization: Bearer fkt_…`, JSON, без бисквитки и без CSRF (няма сесия).
 * Четене: серии, документи (списък, документ, PDF, UBL, CII). Издаване: POST /documents с
 * `Idempotency-Key` — повторена заявка връща същия документ (ключът се записва в транзакцията на
 * издаването). Издава от името на създателя на ключа с правото му към момента. Таван на заявки по ключ.
 */
declare module 'express-serve-static-core' {
  interface Request {
    api?: ApiPrincipal;
  }
}

const ID = /^[a-z0-9]{20,40}$/;

function fail(res: Response, status: number, error: string, extra: object = {}): void {
  res.status(status).json({ error, ...extra });
}

const limiter = (limit: number) =>
  rateLimit({
    windowMs: MINUTE,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.api?.keyId ?? 'anonymous',
    handler: (_req, res) => fail(res, 429, 'rateLimited'),
  });

function scope(needed: ApiScope) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.api?.scopes.includes(needed)) return fail(res, 403, 'scope', { needed });
    next();
  };
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

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().regex(ID).optional(),
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export function apiRouter(): Router {
  const router = Router();
  // Преди проверката на ключа: таван по IP (опитите с непознати ключове също струват заявка към базата).
  router.use(
    '/api',
    rateLimit({
      windowMs: MINUTE,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: requestRateKey,
      handler: (_req, res) => fail(res, 429, 'rateLimited'),
    }),
  );
  router.use('/api', express.json({ limit: '256kb' }));
  router.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const api = await authenticateApiKey(req.get('authorization'));
    if (!api) return fail(res, 401, 'unauthorized');
    if (!api.planAllows) return fail(res, 403, 'plan');
    req.api = api;
    next();
  });
  router.use('/api', limiter(120));

  router.get('/api/v1/series', scope('read'), async (req, res) => {
    const series = await prisma.documentSeries.findMany({
      where: { organizationId: req.api!.organizationId },
      orderBy: { rangeStart: 'asc' },
      select: {
        id: true,
        name: true,
        rangeStart: true,
        rangeEnd: true,
        nextNumber: true,
        isDefault: true,
      },
    });
    res.json({
      data: series.map((s) => ({
        ...s,
        rangeStart: s.rangeStart.toString(),
        rangeEnd: s.rangeEnd.toString(),
        nextNumber: s.nextNumber.toString(),
      })),
    });
  });

  router.get('/api/v1/documents', scope('read'), async (req, res) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) return fail(res, 400, 'invalid', { issues: query.error.issues });
    const { limit, after, status, from, to } = query.data;
    const docs = await prisma.document.findMany({
      where: {
        organizationId: req.api!.organizationId,
        status: status ?? { in: ['ISSUED', 'CANCELLED'] },
        ...(from || to
          ? {
              issueDate: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      select: DOCUMENT_ROW_SELECT,
    });
    const page = docs.slice(0, limit);
    res.json({
      data: page.map(documentJson),
      next: docs.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    });
  });

  router.get('/api/v1/documents/:id', scope('read'), async (req, res) => {
    const id = String(req.params['id']);
    if (!ID.test(id)) return fail(res, 404, 'notFound');
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: req.api!.organizationId, status: { not: 'DRAFT' } },
      select: { ...DOCUMENT_ROW_SELECT, input: true },
    });
    if (!doc) return fail(res, 404, 'notFound');
    res.json({ data: { ...documentJson(doc), input: doc.input } });
  });

  router.get('/api/v1/documents/:id/:format', scope('read'), async (req, res) => {
    const id = String(req.params['id']);
    const format = String(req.params['format']);
    if (!ID.test(id) || !['pdf', 'ubl.xml', 'cii.xml'].includes(format)) {
      return fail(res, 404, 'notFound');
    }
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: req.api!.organizationId, status: { not: 'DRAFT' } },
      select: DOWNLOAD_SELECT,
    });
    if (!doc) return fail(res, 404, 'notFound');
    await sendDocumentFile(res, doc, format);
  });

  router.post('/api/v1/documents', scope('issue'), limiter(30), async (req, res) => {
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
    const settings = await issueSettings();
    try {
      const issued = await prisma.$transaction(async (tx) => {
        const result = await issueInTx(tx, actor.access, actor.actorId, parsed.data, {}, settings);
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
  });

  router.use('/api', (_req, res) => fail(res, 404, 'notFound'));
  // Грешка в API-то — JSON, без подробности навън.
  router.use('/api', (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    // Грешките на парсването на тялото (body-parser): невалиден JSON, твърде голямо тяло.
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return fail(res, status, status === 413 ? 'tooLarge' : 'invalidJson');
    }
    logger.error({ err: errorMessage(error) }, 'грешка в API');
    fail(res, 500, 'error');
  });
  return router;
}
