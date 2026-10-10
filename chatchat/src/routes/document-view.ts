import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, principalOf, requireUser } from '../auth/guards.js';
import { audiencesFor, can } from '../auth/rbac.js';
import {
  readSourcePdf,
  sourceAttachment,
  visibleDocument,
  type VisibleDocument,
} from '../services/document-access.js';
import { signDocumentSourceUrl, verifyDocumentSourceUrl } from '../services/signed-url.js';

/**
 * Визуализаторът на схеми (§9.2): страница на документ като текст, метаданните за навигацията
 * страница → документ → ревизия → продукт и оригиналният PDF. Правилата за достъп са ЕДНИ
 * (`services/document-access.ts`) за трите маршрута. Оригиналът се дава като `GET …/source`
 * (адрес, подписан за ТОЗИ човек, 5 мин.) и `GET …/source/file` (подписът + достъпът наново).
 */

const Id = z.string().min(1).max(40);
const PageParams = z.object({
  id: Id,
  page: z.coerce.number().int().min(1).max(100000),
});

export function documentViewRouter(deps: AppDeps): Router {
  const router = Router();
  // Оригиналът е до 50 MB и всеки преглед го чете и хешира — по-строго от общите справки (120/мин.).
  const sourceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });

  // Страница на документа като текст (резервният вариант + позициите на компонентите).
  router.get('/documents/:id/pages/:page', requireUser, async (req, res, next) => {
    try {
      const parsed = PageParams.safeParse(req.params);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const document = await visibleDocument(deps.db, principalOf(req), parsed.data.id);
      if (!document) return apiError(res, 404, 'not_found');
      const chunks = await deps.db.documentChunk.findMany({
        where: { documentId: document.id, page: parsed.data.page },
        orderBy: { ordinal: 'asc' },
        select: { id: true, section: true, text: true, componentRefs: true },
      });
      if (chunks.length === 0) return apiError(res, 404, 'not_found');
      res.json({ document: brief(document), page: parsed.data.page, chunks });
    } catch (err) {
      next(err);
    }
  });

  // Метаданни за навигацията + подписан адрес към оригинала (ако документът има такъв).
  router.get('/documents/:id/source', requireUser, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const document = await visibleDocument(deps.db, p, id.data, { drafts: true });
      if (!document) return apiError(res, 404, 'not_found');
      const [attachment, products, revisions, pages] = await Promise.all([
        deps.attachments ? sourceAttachment(deps.db, document) : null,
        deps.db.documentApplicability.findMany({
          where: { documentId: document.id, product: { tenantId: document.tenantId } },
          select: { hwRevision: true, fwMin: true, fwMax: true, product: true },
        }),
        deps.db.document.findMany({
          where: {
            tenantId: document.tenantId,
            code: document.code,
            audience: { in: [...audiencesFor(p.user.role)] },
            ...(can(p.user.role, 'kb:manage') ? {} : { status: 'PUBLISHED' }),
          },
          select: { id: true, revision: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        deps.db.documentChunk.findMany({
          where: { documentId: document.id },
          distinct: ['page'],
          select: { page: true },
        }),
      ]);
      const signed =
        attachment && deps.attachments
          ? signDocumentSourceUrl(deps.attachments.urlKey, document.id, p.user.id)
          : null;
      res.json({
        document: brief(document),
        source: signed
          ? {
              available: true,
              url: signed.url,
              expiresAt: signed.expiresAt,
              sizeBytes: attachment?.sizeBytes ?? 0,
            }
          : { available: false },
        textPages: pages.map((x) => x.page).sort((a, b) => a - b),
        products: products.map((a) => ({
          model: a.product.model,
          family: a.product.family,
          hwRevision: a.hwRevision,
          fwMin: a.fwMin,
          fwMax: a.fwMax,
        })),
        revisions: revisions.map((r) => ({
          id: r.id,
          revision: r.revision,
          status: r.status,
          current: r.id === document.id,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Самият PDF. Подписът е за ТОЗИ човек и този документ; достъпът се проверява наново.
  router.get('/documents/:id/source/file', requireUser, sourceLimiter, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      if (!deps.attachments) return apiError(res, 503, 'attachments_unavailable');
      const p = principalOf(req);
      const check = verifyDocumentSourceUrl(
        deps.attachments.urlKey,
        id.data,
        p.user.id,
        req.query.exp,
        req.query.sig,
      );
      if (check === 'invalid') return apiError(res, 403, 'forbidden');
      if (check === 'expired') return apiError(res, 403, 'link_expired');
      const document = await visibleDocument(deps.db, p, id.data, { drafts: true });
      if (!document) return apiError(res, 404, 'not_found');
      const attachment = await sourceAttachment(deps.db, document);
      const bytes = attachment ? await readSourcePdf(deps.attachments, attachment) : null;
      if (!bytes || !attachment) return apiError(res, 404, 'not_found');
      // Следа за изтичане на схеми (както свалянето на оригинала през /files): само id и размер.
      // Вижда я само платформеният администратор (`PERSON_ACTIVITY_AUDIT_ACTIONS`, чл. 4 Statuto).
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'document.source.view',
        objectType: 'document',
        objectId: document.id,
        detail: { attachmentId: attachment.id, sizeBytes: attachment.sizeBytes },
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', 'sandbox');
      res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).end(bytes);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function brief(d: VisibleDocument) {
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    revision: d.revision,
    type: d.type,
    status: d.status,
    language: d.language,
  };
}
