import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { fieldDiffs, pageDiffs, ruleKey, setDiff } from '../services/doc-compare.js';
import { sourceAttachment } from '../services/document-access.js';
import {
  applicabilityView,
  documentAdminInclude,
  documentView,
} from '../services/document-views.js';
import { knowledgeHistory } from '../services/kb-lifecycle.js';

/**
 * Преглед преди публикуване и сравнение (§4.1 „anteprima pagina, estratti indicizzati e sorgenti
 * prima della pubblicazione“, „confronto tra revisioni“) — само kb:manage и само в клиента.
 * Тук черновата се вижда цялата (страници, парчета с componentRefs, оригиналът през подписания
 * адрес на `/documents/:id/source`); публичният `/documents/:id/pages/:page` остава 404 за нея.
 * Само четене — без одит (действията са в `admin-documents-lifecycle.ts`).
 */

const Id = z.string().min(1).max(40);
const PageParams = z.object({ id: Id, page: z.coerce.number().int().min(1).max(100000) });
const CompareQuery = z.object({ a: Id, b: Id }).strict();
const Serial = z.string().trim().min(1).max(80);
/** Колко страници най-много сравняваме текстово наведнъж. */
const MAX_COMPARE_PAGES = 500;

/** Текстът на документа по страници (парчетата по ред) и компонентите му. */
async function pagesOf(db: PrismaClient, documentId: string) {
  const chunks = await db.documentChunk.findMany({
    where: { documentId },
    orderBy: [{ page: 'asc' }, { ordinal: 'asc' }],
    select: { page: true, text: true, componentRefs: true, errorCodes: true },
  });
  const pages = new Map<number, { texts: string[]; components: Set<string> }>();
  for (const c of chunks) {
    const p = pages.get(c.page) ?? { texts: [], components: new Set<string>() };
    p.texts.push(c.text);
    for (const ref of c.componentRefs) p.components.add(ref);
    pages.set(c.page, p);
  }
  return [...pages.entries()].map(([page, p]) => ({
    page,
    text: p.texts.join('\n\n'),
    chunks: p.texts.length,
    components: [...p.components].sort(),
  }));
}

export function adminDocumentsViewRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  // Две ревизии на един код една до друга: метаданни, приложимост, текст по страници, компоненти.
  router.get('/documents/compare', async (req, res, next) => {
    try {
      const q = CompareQuery.safeParse(req.query);
      if (!q.success || q.data.a === q.data.b) return apiError(res, 400, 'invalid_input');
      const { tenantId, id: me } = principalOf(req).user;
      const [a, b] = await Promise.all(
        [q.data.a, q.data.b].map((id) =>
          deps.db.document.findFirst({ where: { id, tenantId }, include: documentAdminInclude }),
        ),
      );
      if (!a || !b) return apiError(res, 404, 'not_found');
      // Сравняват се само ревизии на ЕДИН документ (същият код).
      if (a.code !== b.code) return apiError(res, 400, 'invalid_input');
      const [pa, pb] = await Promise.all([pagesOf(deps.db, a.id), pagesOf(deps.db, b.id)]);
      const now = new Date();
      const rulesA = a.applicability.map((r) => ruleKey(applicabilityView(r)));
      const rulesB = b.applicability.map((r) => ruleKey(applicabilityView(r)));
      res.json({
        a: documentView(a, me, now),
        b: documentView(b, me, now),
        metadata: fieldDiffs(a, b, [
          'title',
          'type',
          'language',
          'audience',
          'safetyRelevant',
          'subsystem',
          'status',
          'effectiveFrom',
          'effectiveTo',
          'sourceFilename',
          'checksum',
        ]),
        applicability: setDiff(rulesA, rulesB),
        components: setDiff(
          pa.flatMap((p) => p.components),
          pb.flatMap((p) => p.components),
        ),
        pages: pageDiffs(pa.slice(0, MAX_COMPARE_PAGES), pb.slice(0, MAX_COMPARE_PAGES)),
        truncated: pa.length > MAX_COMPARE_PAGES || pb.length > MAX_COMPARE_PAGES,
      });
    } catch (err) {
      next(err);
    }
  });

  // Детайлът: метаданните, ревизиите на кода, страниците с компонентите, оригиналът, историята.
  router.get('/documents/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const { tenantId, id: me } = principalOf(req).user;
      const doc = await deps.db.document.findFirst({
        where: { id: id.data, tenantId },
        include: documentAdminInclude,
      });
      if (!doc) return apiError(res, 404, 'not_found');
      const [revisions, pages, original, history, errors] = await Promise.all([
        deps.db.document.findMany({
          where: { tenantId, code: doc.code },
          select: { id: true, revision: true, status: true, supersedesId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        pagesOf(deps.db, doc.id),
        deps.attachments ? sourceAttachment(deps.db, doc) : null,
        knowledgeHistory(deps.db, tenantId, 'document', doc.id),
        deps.db.errorCode.findMany({
          where: { tenantId, sourceDocumentId: doc.id },
          select: { id: true, code: true, version: true, status: true },
          orderBy: [{ code: 'asc' }, { version: 'asc' }],
          take: 200,
        }),
      ]);
      res.json({
        document: documentView(doc, me),
        revisions: revisions.map((r) => ({ ...r, current: r.id === doc.id })),
        pages: pages.map(({ page, chunks, components }) => ({ page, chunks, components })),
        source: { available: original !== null },
        history,
        errors,
      });
    } catch (err) {
      next(err);
    }
  });

  // Една страница с извлечените парчета — и за чернова (прегледът преди публикуване).
  router.get('/documents/:id/pages/:page', async (req, res, next) => {
    try {
      const parsed = PageParams.safeParse(req.params);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const doc = await deps.db.document.findFirst({
        where: { id: parsed.data.id, tenantId },
        select: { id: true, code: true, revision: true, title: true, status: true },
      });
      if (!doc) return apiError(res, 404, 'not_found');
      const chunks = await deps.db.documentChunk.findMany({
        where: { documentId: doc.id, page: parsed.data.page },
        orderBy: { ordinal: 'asc' },
        select: {
          id: true,
          ordinal: true,
          section: true,
          text: true,
          componentRefs: true,
          errorCodes: true,
        },
      });
      if (chunks.length === 0) return apiError(res, 404, 'not_found');
      res.json({ document: doc, page: parsed.data.page, chunks });
    } catch (err) {
      next(err);
    }
  });

  // Документите, вързани САМО за това табло (уникалните му схеми) — всеки статус.
  router.get('/devices/:serial/documents', async (req, res, next) => {
    try {
      const serial = Serial.safeParse(req.params.serial);
      if (!serial.success) return apiError(res, 400, 'invalid_input');
      const { tenantId, id: me } = principalOf(req).user;
      const device = await deps.db.device.findUnique({
        where: { tenantId_serial: { tenantId, serial: serial.data } },
        select: { id: true },
      });
      if (!device) return apiError(res, 404, 'not_found');
      const docs = await deps.db.document.findMany({
        where: { tenantId, applicability: { some: { deviceId: device.id } } },
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

  return router;
}
