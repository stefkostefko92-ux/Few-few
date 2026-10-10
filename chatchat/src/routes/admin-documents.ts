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
import { documentAdminInclude, documentView } from '../services/document-views.js';
import { extractPdfText, type PdfFailure } from '../services/pdf.js';

/**
 * Управление на знанието (§4.1, §11.3, AC-10): списък и приемане (DRAFT). Преходите са в
 * `admin-documents-lifecycle.ts`, прегледът/сравнението — в `admin-documents-view.ts`.
 * Документите са НЕИЗМЕНИМИ (решение на собственика): няма редакция на място — само нова ревизия
 * (нов документ) и преходи на статуса. Публикуване/отписване НЕ иска преобучение.
 */

const ListQuery = z.object({
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED']).optional(),
  /** Само ревизиите на един код (сравнение, история). */
  code: z.string().trim().min(2).max(60).optional(),
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

export function adminDocumentsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  router.get('/documents', async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const { tenantId, id: me } = principalOf(req).user;
      const docs = await deps.db.document.findMany({
        where: {
          tenantId,
          ...(q.data.status ? { status: q.data.status } : {}),
          ...(q.data.code ? { code: q.data.code } : {}),
        },
        include: documentAdminInclude,
        orderBy: [{ code: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      const now = new Date();
      res.json({ documents: docs.map((d) => documentView(d, me, now)) });
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
        const status =
          result.error.code === 'duplicate_revision'
            ? 409
            : result.error.code === 'invalid_input'
              ? 400
              : 422;
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
          boardSpecific: input.applicability.some((a) => a.deviceSerial !== undefined),
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

  return router;
}
