import type { AttachmentKind } from '@prisma/client';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { loadPrincipal } from '../auth/sessions.js';
import { acceptUpload, attachmentView, type UploadOutcome } from '../services/attachments.js';
import { addTimeline, findCaseFor } from '../services/cases.js';
import { MAX_BYTES } from '../services/filetype.js';

/**
 * Качване на прикачени файлове (FR-06, §12.1 „Allegati chat“, §13.3). Тялото е суровите байтове
 * (без multipart/multer), а парсерът е монтиран САМО тук и СЛЕД сесия, CSRF, роля, лимит и
 * достъп до случая — анонимен или чужд потребител не кара сървъра да чете 10/50 MB.
 * Типът се познава по съдържанието; името от `?name=` е само за показване (изчистено).
 * Монтира се ПРЕДИ JSON парсерите в app.ts: лог с Content-Type application/json е файл, не заявка.
 */

const Id = z.string().min(1).max(40);
const CaseQuery = z.object({
  kind: z.enum(['PHOTO', 'LOG']),
  name: z.string().max(1000).optional(),
});
const AdminQuery = z.object({ name: z.string().max(1000).optional() });

/** Суровото тяло с таван по вида; компресирано тяло (Content-Encoding) — отказ, без „бомби“. */
const rawParsers: Record<AttachmentKind, express.RequestHandler> = {
  PHOTO: express.raw({ type: () => true, limit: MAX_BYTES.PHOTO, inflate: false }),
  LOG: express.raw({ type: () => true, limit: MAX_BYTES.LOG, inflate: false }),
  DOCUMENT: express.raw({ type: () => true, limit: MAX_BYTES.DOCUMENT, inflate: false }),
};

interface UploadLocals {
  kind: AttachmentKind;
  name: string | undefined;
  caseId: string | null;
}

function sendOutcome(res: Response, outcome: Extract<UploadOutcome, { ok: true }>): void {
  const attachment = attachmentView(outcome.attachment);
  if (outcome.verdict.status === 'CLEAN') {
    res.status(201).json({ attachment });
  } else if (outcome.verdict.status === 'INFECTED') {
    res.status(422).json({ error: 'attachment_infected', code: 'attachment_infected', attachment });
  } else {
    res.status(503).json({ error: 'av_scan_failed', code: 'av_scan_failed', attachment });
  }
}

export function attachmentUploadRouter(deps: AppDeps): Router {
  const router = Router();
  const before = [loadPrincipal(deps.sessions), requireUser, requireCsrf(deps.publicOrigin)];

  // Злоупотреба и пълнене на диска (§15.1): по потребител, не по IP — техниците са зад един NAT.
  const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });

  /** Без хранилище или без антивирус качването е изключено (fail-closed) — преди тялото. */
  const available = (_req: Request, res: Response, next: NextFunction) => {
    if (!deps.attachments) return apiError(res, 503, 'attachments_unavailable');
    if (!deps.attachments.scanner) return apiError(res, 503, 'av_unavailable');
    next();
  };

  const rawBody = (_req: Request, res: Response, next: NextFunction) => {
    const { kind } = res.locals as UploadLocals;
    rawParsers[kind](_req, res, next);
  };

  const upload = async (req: Request, res: Response) => {
    const att = deps.attachments;
    if (!att?.scanner) return apiError(res, 503, 'av_unavailable');
    if (!Buffer.isBuffer(req.body)) return apiError(res, 400, 'invalid_input');
    const p = principalOf(req);
    const locals = res.locals as UploadLocals;
    const outcome = await acceptUpload(
      deps.db,
      { store: att.store, scanner: att.scanner, logger: deps.logger },
      {
        tenantId: p.user.tenantId,
        userId: p.user.id,
        kind: locals.kind,
        caseId: locals.caseId,
        name: locals.name,
        bytes: req.body,
      },
    );
    deps.metrics?.uploads.inc({
      kind: locals.kind,
      result: !outcome.ok
        ? 'rejected'
        : outcome.verdict.status === 'CLEAN'
          ? 'clean'
          : outcome.verdict.status === 'INFECTED'
            ? 'infected'
            : 'scan_failed',
    });
    if (!outcome.ok) return apiError(res, outcome.status, outcome.code);
    if (locals.caseId) {
      await addTimeline(deps.db, locals.caseId, 'attachment.uploaded', p.user.id, {
        attachmentId: outcome.attachment.id,
        kind: outcome.attachment.kind,
        scanStatus: outcome.attachment.scanStatus,
      });
    }
    sendOutcome(res, outcome);
  };

  // POST /cases/:id/attachments?kind=PHOTO|LOG&name=… — снимка или лог към случая.
  router.post(
    '/cases/:id/attachments',
    ...before,
    requireCapability('chat:ask'),
    uploadLimiter,
    available,
    async (req, res, next) => {
      const id = Id.safeParse(req.params.id);
      const q = CaseQuery.safeParse(req.query);
      if (!id.success || !q.success) return apiError(res, 400, 'invalid_input');
      const c = await findCaseFor(deps.db, principalOf(req), id.data);
      if (!c) return apiError(res, 404, 'not_found');
      if (c.status === 'RESOLVED') return apiError(res, 409, 'case_closed');
      Object.assign(res.locals, { kind: q.data.kind, name: q.data.name, caseId: c.id });
      next();
    },
    rawBody,
    upload,
  );

  // POST /admin/attachments?name=… — PDF за базата знания (само kb:manage).
  router.post(
    '/admin/attachments',
    ...before,
    requireCapability('kb:manage'),
    uploadLimiter,
    available,
    (req, res, next) => {
      const q = AdminQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      Object.assign(res.locals, { kind: 'DOCUMENT', name: q.data.name, caseId: null });
      next();
    },
    rawBody,
    upload,
  );

  return router;
}
