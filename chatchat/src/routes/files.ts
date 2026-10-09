import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, principalOf, requireUser } from '../auth/guards.js';
import { canReadAttachment, contentDisposition } from '../services/attachments.js';
import { signFileUrl, verifyFileUrl } from '../services/signed-url.js';

/**
 * Сваляне на прикачени файлове (§13.3 „договор за сигурност“): само CLEAN; първо краткотраен
 * подписан адрес, вързан към човека (5 мин.), после самото сваляне — подписът, срокът, СЪЩИЯТ
 * потребител в сесията И отново достъпът до случая. Отговорът не се кешира, не се „души“
 * (nosniff), не изпълнява нищо (CSP sandbox) и е изтегляне, освен за снимките.
 */

const Id = z.string().min(1).max(40);

function contentType(mime: string): string {
  return mime.startsWith('text/') || mime === 'application/json' ? `${mime}; charset=utf-8` : mime;
}

export function filesRouter(deps: AppDeps): Router {
  const router = Router();

  // GET /attachments/:id/url → { url, expiresAt } — само CLEAN и само с достъп.
  router.get('/attachments/:id/url', requireUser, async (req, res) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return apiError(res, 400, 'invalid_input');
    if (!deps.attachments) return apiError(res, 503, 'attachments_unavailable');
    const p = principalOf(req);
    const a = await deps.db.attachment.findFirst({
      where: { id: id.data, tenantId: p.user.tenantId },
    });
    if (!a || !(await canReadAttachment(deps.db, p, a))) return apiError(res, 404, 'not_found');
    const signed = signFileUrl(deps.attachments.urlKey, a.id, p.user.id);
    res.json({ url: signed.url, expiresAt: signed.expiresAt });
  });

  // GET /files/:id?exp=…&sig=… — самият файл.
  router.get('/files/:id', requireUser, async (req, res) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return apiError(res, 400, 'invalid_input');
    if (!deps.attachments) return apiError(res, 503, 'attachments_unavailable');
    const p = principalOf(req);
    // Подписът е за ТОЗИ човек: чужда сесия с валиден адрес → 403, без да пипаме базата.
    const check = verifyFileUrl(
      deps.attachments.urlKey,
      id.data,
      p.user.id,
      req.query.exp,
      req.query.sig,
    );
    if (check === 'invalid') return apiError(res, 403, 'forbidden');
    if (check === 'expired') return apiError(res, 403, 'link_expired');
    const a = await deps.db.attachment.findFirst({
      where: { id: id.data, tenantId: p.user.tenantId },
    });
    if (!a || !(await canReadAttachment(deps.db, p, a))) return apiError(res, 404, 'not_found');
    const bytes = await deps.attachments.store.get(a.objectKey);
    if (!bytes) return apiError(res, 404, 'not_found');
    if (a.kind === 'DOCUMENT') {
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'attachment.download',
        objectType: 'attachment',
        objectId: a.id,
        detail: { kind: a.kind, sizeBytes: a.sizeBytes },
      });
    }
    res.setHeader('Content-Type', contentType(a.mime));
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(a.kind === 'PHOTO' ? 'inline' : 'attachment', a.originalName),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).end(bytes);
  });

  return router;
}
