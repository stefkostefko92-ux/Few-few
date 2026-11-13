import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { documentUpload, uploadStatus } from '../http/upload.js';
import { IncomingError } from '../incoming/check.js';
import { IncomingRegisterError, setIncomingStatus, uploadIncoming } from '../incoming/register.js';
import { HOUR, sofiaToday } from '../time.js';
import { param } from './app-shared.js';

/**
 * „Входящи“ (SPEC 55): регистърът — качените UBL/CII файлове и доставените в шкафчето; качване с
 * проверка по правилата; запис на входящия документ с резултата; платена/отказана. Четене —
 * `documents.read`; запис — `documents.issue`.
 */
const uploadLimiter = rateLimit({
  windowMs: HOUR,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

export function appIncomingRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/vhodyashti', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, uploads, inbox] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true },
      }),
      prisma.incomingInvoice.findMany({
        where: { organizationId: access.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          supplierName: true,
          supplierEik: true,
          number: true,
          issueDate: true,
          dueDate: true,
          currency: true,
          payableCents: true,
          status: true,
          valid: true,
          createdAt: true,
        },
      }),
      prisma.inboxEntry.findMany({
        where: { recipientOrgId: access.organizationId },
        orderBy: { deliveredAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          deliveredAt: true,
          senderOrg: { select: { legalName: true, eik: true } },
          document: {
            select: {
              number: true,
              issueDate: true,
              dueDate: true,
              currency: true,
              payableCents: true,
            },
          },
        },
      }),
    ]);
    // Един регистър: качените и доставените в шкафчето, по дата.
    const rows = [
      ...uploads.map((u) => ({
        kind: 'upload' as const,
        id: u.id,
        supplier: u.supplierName,
        eik: u.supplierEik,
        number: u.number,
        issueDate: u.issueDate,
        dueDate: u.dueDate,
        currency: u.currency,
        payableCents: u.payableCents,
        status: u.status,
        valid: u.valid,
        at: u.createdAt,
      })),
      ...inbox.map((e) => ({
        kind: 'inbox' as const,
        id: e.id,
        supplier: e.senderOrg.legalName,
        eik: e.senderOrg.eik,
        number: e.document.number ?? '',
        issueDate: e.document.issueDate,
        dueDate: e.document.dueDate,
        currency: e.document.currency,
        payableCents: e.document.payableCents,
        status: e.status,
        valid: true,
        at: e.deliveredAt,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    res.render('app/incoming', {
      org,
      rows,
      canWrite: roleCan(access.role, 'documents.issue'),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.post('/app/o/:orgId/vhodyashti', uploadLimiter, documentUpload(), async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const base = `/app/o/${access.organizationId}/vhodyashti`;
    const status = uploadStatus(req);
    if (status !== 'ok' || !req.file) {
      return res.redirect(303, `${base}?err=${status === 'tooLarge' ? 'tooLarge' : 'file'}`);
    }
    try {
      const result = await uploadIncoming(access, req.principal!.user.id, {
        name: req.file.originalname,
        buffer: req.file.buffer,
      });
      res.redirect(303, `${base}/${result.id}?ok=${result.valid ? 'uploaded' : 'uploadedIssues'}`);
    } catch (error) {
      if (error instanceof IncomingError || error instanceof IncomingRegisterError) {
        return res.redirect(303, `${base}?err=${error.code}`);
      }
      throw error;
    }
  });

  router.get('/app/o/:orgId/vhodyashti/:id', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await prisma.incomingInvoice.findFirst({
      where: { id: param(req, 'id'), organizationId: access.organizationId },
      omit: { xml: true },
    });
    if (!entry) throw new HttpError(404);
    res.render('app/incoming-entry', {
      orgId: access.organizationId,
      entry,
      issues: Array.isArray(entry.issues) ? entry.issues : [],
      canWrite: roleCan(access.role, 'documents.issue'),
      today: sofiaToday(),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.get('/app/o/:orgId/vhodyashti/:id/fail.xml', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const entry = await prisma.incomingInvoice.findFirst({
      where: { id: param(req, 'id'), organizationId: access.organizationId },
      select: { xml: true, number: true },
    });
    if (!entry) throw new HttpError(404);
    const safe = entry.number.replace(/[^\w.-]/g, '_').slice(0, 50);
    res
      .set('Cache-Control', 'private, no-store')
      .set('Content-Disposition', `attachment; filename="vhodyashta-${safe}.xml"`)
      .type('application/xml')
      .send(entry.xml);
  });

  router.post('/app/o/:orgId/vhodyashti/:id/status', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const id = param(req, 'id');
    const body = req.body as Record<string, unknown>;
    const status = body['status'];
    const base = `/app/o/${access.organizationId}/vhodyashti/${id}`;
    if (status !== 'RECEIVED' && status !== 'PAID' && status !== 'REJECTED') {
      return res.redirect(303, `${base}?err=invalid`);
    }
    try {
      await setIncomingStatus(
        access,
        req.principal!.user.id,
        id,
        status,
        typeof body['paidOn'] === 'string' ? body['paidOn'] : undefined,
      );
    } catch (error) {
      if (error instanceof IncomingRegisterError) {
        if (error.code === 'notFound') throw new HttpError(404);
        return res.redirect(303, `${base}?err=${error.code}`);
      }
      throw error;
    }
    res.redirect(303, `${base}?ok=status`);
  });

  return router;
}
