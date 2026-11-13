import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { HttpError } from '../auth/guards.js';
import { MINUTE } from '../time.js';
import { DOWNLOAD_SELECT, sendDocumentFile } from '../routes/app-shared.js';
import { requestRateKey } from '../http/ip.js';
import { isIsoDate } from '../recurring/schedule.js';
import { authenticateApiKey, type ApiPrincipal, type ApiScope } from './keys.js';
import { DOCUMENT_ROW_SELECT, documentJson } from './serialize.js';
import { issueHandler } from './issue.js';

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

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().regex(ID).optional(),
  status: z.enum(['ISSUED', 'CANCELLED']).optional(),
  from: z.string().refine(isIsoDate).optional(),
  to: z.string().refine(isIsoDate).optional(),
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
    // Създателят вече не е член (махнат, напуснал, закрит профил) — ключът не чете и не издава.
    if (!api.creatorActive) return fail(res, 403, 'access');
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
        // Keyset: документ, сменил статуса между страниците, не изяжда следващия (cursor+skip би).
        ...(after ? { id: { gt: after } } : {}),
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

  router.post('/api/v1/documents', scope('issue'), limiter(30), issueHandler);

  router.use('/api', (_req, res) => fail(res, 404, 'notFound'));
  // Грешка в API-то — JSON, без подробности навън.
  router.use('/api', (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    // Грешките на парсването на тялото (body-parser): невалиден JSON, твърде голямо тяло.
    // Само грешките на парсването на тялото са „invalidJson“/„tooLarge“ (body-parser слага `type`).
    const type = (error as { type?: unknown }).type;
    if (type === 'entity.too.large') return fail(res, 413, 'tooLarge');
    if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
      return fail(res, 415, 'unsupportedEncoding');
    }
    if (typeof type === 'string' && type.startsWith('entity.'))
      return fail(res, 400, 'invalidJson');
    if (error instanceof HttpError && error.status === 404) return fail(res, 404, 'notFound');
    logger.error({ err: errorMessage(error) }, 'грешка в API');
    fail(res, 500, 'error');
  });
  return router;
}
