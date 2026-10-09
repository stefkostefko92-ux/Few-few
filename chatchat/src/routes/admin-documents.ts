import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  DocumentRequestSchema,
  ingestDocument,
  pageWarnings,
  type DocumentInput,
} from '../services/ingest.js';
import { extractPdfText, type PdfFailure } from '../services/pdf.js';

/**
 * Управление на знанието (§4.1, §11.3, AC-10): Draft → Review → Published → Deprecated.
 * Публикуване и отписване на ревизия НЕ иска преобучение — AI вижда само PUBLISHED.
 * Документ по безопасност: публикува го човек, различен от качилия (принцип на четирите очи).
 */

const Id = z.string().min(1).max(40);
const ListQuery = z.object({
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED']).optional(),
});

type PdfSource =
  | { ok: true; name: string; sha256: string; pages: DocumentInput['pages'] }
  | { ok: false; status: number; code: string; reason?: PdfFailure };

/**
 * §7.3 т. 2: текстът на CLEAN PDF от същия клиент, по страници. Файлът е минал антивируса при
 * качването (POST /admin/attachments); тук само се чете от частното хранилище.
 */
async function pdfSource(
  deps: AppDeps,
  tenantId: string,
  attachmentId: string,
): Promise<PdfSource> {
  if (!deps.attachments) return { ok: false, status: 503, code: 'attachments_unavailable' };
  const a = await deps.db.attachment.findFirst({ where: { id: attachmentId, tenantId } });
  if (!a || a.kind !== 'DOCUMENT' || a.mime !== 'application/pdf' || a.scanStatus !== 'CLEAN') {
    return { ok: false, status: 422, code: 'invalid_attachment' };
  }
  const bytes = await deps.attachments.store.get(a.objectKey);
  if (!bytes) return { ok: false, status: 422, code: 'invalid_attachment' };
  const extracted = await extractPdfText(bytes);
  if (!extracted.ok) {
    return { ok: false, status: 422, code: 'pdf_unreadable', reason: extracted.reason };
  }
  return { ok: true, name: a.originalName, sha256: a.sha256, pages: extracted.pages };
}

type Transition = 'submit' | 'reject' | 'publish' | 'deprecate';
const FROM: Record<Transition, string> = {
  submit: 'DRAFT',
  reject: 'REVIEW',
  publish: 'REVIEW',
  deprecate: 'PUBLISHED',
};

export function adminDocumentsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  router.get('/documents', async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const docs = await deps.db.document.findMany({
        where: { tenantId, ...(q.data.status ? { status: q.data.status } : {}) },
        include: {
          applicability: { include: { product: { select: { model: true } } } },
          _count: { select: { chunks: true } },
        },
        orderBy: [{ code: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      res.json({
        documents: docs.map((d) => ({
          id: d.id,
          code: d.code,
          title: d.title,
          type: d.type,
          language: d.language,
          revision: d.revision,
          status: d.status,
          audience: d.audience,
          safetyRelevant: d.safetyRelevant,
          checksum: d.checksum,
          chunks: d._count.chunks,
          supersedesId: d.supersedesId,
          applicability: d.applicability.map((a) => ({
            productModel: a.product.model,
            hwRevision: a.hwRevision,
            fwMin: a.fwMin,
            fwMax: a.fwMax,
          })),
          publishedAt: d.publishedAt,
          deprecatedAt: d.deprecatedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents', async (req, res, next) => {
    try {
      const parsed = DocumentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_input',
          code: 'invalid_input',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const p = principalOf(req);
      const { pages, sourceAttachmentId, sourceFilename, ...meta } = parsed.data;
      let input: DocumentInput;
      let checksum: string | undefined;
      if (sourceAttachmentId) {
        // С PDF: checksum = sha256 на оригинала (§7.2), името — от файла.
        const source = await pdfSource(deps, p.user.tenantId, sourceAttachmentId);
        if (!source.ok) {
          const { status, code, reason } = source;
          return res.status(status).json({ error: code, code, ...(reason ? { reason } : {}) });
        }
        input = { ...meta, sourceFilename: source.name, pages: source.pages };
        checksum = source.sha256;
      } else if (pages && sourceFilename) {
        input = { ...meta, sourceFilename, pages };
      } else {
        return apiError(res, 400, 'invalid_input');
      }
      const result = await ingestDocument(deps.db, p.user.tenantId, p.user.id, input, {
        checksum,
      });
      if (!result.ok) {
        const status = result.error.code === 'duplicate_revision' ? 409 : 422;
        return res.status(status).json({ error: result.error.code, ...result.error });
      }
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'kb.document.upload',
        objectType: 'document',
        objectId: result.documentId,
        detail: {
          code: input.code,
          revision: input.revision,
          chunks: result.chunks,
          sourceAttachmentId: sourceAttachmentId ?? null,
        },
      });
      res.status(201).json({
        documentId: result.documentId,
        chunks: result.chunks,
        // Сканирана страница без текстов слой — OCR не правим; качилият решава.
        warnings: pageWarnings(input.pages),
      });
    } catch (err) {
      next(err);
    }
  });

  const transition = (action: Transition) =>
    router.post(`/documents/:id/${action}`, async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        if (!id.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const doc = await deps.db.document.findFirst({
          where: { id: id.data, tenantId: p.user.tenantId },
          include: { _count: { select: { chunks: true, applicability: true } } },
        });
        if (!doc) return apiError(res, 404, 'not_found');
        if (doc.status !== FROM[action]) return apiError(res, 409, 'invalid_transition');
        const now = new Date();

        if (action === 'publish') {
          // §7.3: търсим само с достатъчно метаданни за приложимостта.
          if (doc._count.chunks === 0 || doc._count.applicability === 0) {
            return apiError(res, 422, 'insufficient_metadata');
          }
          if (doc.safetyRelevant && doc.uploadedById === p.user.id) {
            return apiError(res, 409, 'four_eyes_required');
          }
          await deps.db.$transaction(async (tx) => {
            await tx.document.update({
              where: { id: doc.id },
              data: {
                status: 'PUBLISHED',
                approvedById: p.user.id,
                approvedAt: now,
                publishedAt: now,
              },
            });
            if (doc.supersedesId) {
              await tx.document.updateMany({
                where: { id: doc.supersedesId, tenantId: p.user.tenantId, status: 'PUBLISHED' },
                data: { status: 'DEPRECATED', deprecatedAt: now },
              });
            }
          });
          deps.onDocumentPublished?.(doc.id);
        } else {
          const data =
            action === 'submit'
              ? { status: 'REVIEW' as const }
              : action === 'reject'
                ? { status: 'DRAFT' as const, reviewedById: p.user.id }
                : { status: 'DEPRECATED' as const, deprecatedAt: now };
          await deps.db.document.update({ where: { id: doc.id }, data });
        }

        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: `kb.document.${action}`,
          objectType: 'document',
          objectId: doc.id,
          detail: { code: doc.code, revision: doc.revision, supersedes: doc.supersedesId },
        });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    });

  transition('submit');
  transition('reject');
  transition('publish');
  transition('deprecate');

  return router;
}
