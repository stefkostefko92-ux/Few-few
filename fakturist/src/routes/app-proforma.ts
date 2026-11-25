import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { HOUR } from '../time.js';
import { kickOutbox } from '../mail/outbox.js';
import { cancelProforma, sendProforma } from '../proforma/proforma.js';
import { ProformaError } from '../proforma/link.js';
import { proformaDocumentPdf } from '../proforma/render.js';
import { param } from './app-shared.js';
import { afterDate, PAGE_SIZE, pageOf, pagerLinks, readCursor } from '../http/pagination.js';

/**
 * „Проформи“: списъкът, страницата на проформата, PDF, изпращане по имейл, отказ. Създаването е от
 * формата за документ (вид „Проформа фактура“), а „Издай фактура“ отваря формата попълнена
 * (`/nov?ot-proforma=`). Четене — `documents.read`; запис — `documents.issue`.
 */
const sendLimiter = rateLimit({
  windowMs: HOUR,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const EmailSchema = z.string().trim().toLowerCase().email().max(200);

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

export function appProformaRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/proformi', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const cursor = readCursor(req.query['predi']);
    const [org, rows] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true },
      }),
      prisma.proforma.findMany({
        where: { organizationId: access.organizationId, ...afterDate('createdAt', cursor, 'desc') },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          createdAt: true,
          number: true,
          status: true,
          issueDate: true,
          validUntil: true,
          buyerName: true,
          payableCents: true,
          currency: true,
          invoiceDocument: { select: { id: true, number: true } },
        },
      }),
    ]);
    const page = pageOf(rows, PAGE_SIZE, (row) => row.createdAt);
    res.render('app/proformas', {
      org,
      proformas: page.items,
      pager: pagerLinks(req, `/app/o/${org.id}/proformi`, 'predi', [], page.next),
      canWrite: roleCan(access.role, 'documents.issue'),
    });
  });

  router.get('/app/o/:orgId/proformi/:id', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const proforma = await prisma.proforma.findFirst({
      where: { id: param(req, 'id'), organizationId: access.organizationId },
      include: {
        invoiceDocument: { select: { id: true, number: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!proforma) throw new HttpError(404);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { id: true, legalName: true },
    });
    res.render('app/proforma', {
      org,
      proforma,
      canWrite: roleCan(access.role, 'documents.issue'),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.get('/app/o/:orgId/proformi/:id/proforma.pdf', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const proforma = await prisma.proforma.findFirst({
      where: { id: param(req, 'id'), organizationId: access.organizationId },
      select: { organizationId: true, number: true, input: true, pdfLanguage: true },
    });
    if (!proforma) throw new HttpError(404);
    const pdf = await proformaDocumentPdf(proforma);
    res
      .set('Cache-Control', 'private, no-store')
      .type('application/pdf')
      .set(
        'Content-Disposition',
        `inline; filename="proforma-${proforma.number.replace(/\D/g, '')}.pdf"`,
      )
      .send(pdf);
  });

  router.post('/app/o/:orgId/proformi/:id/izprati', sendLimiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const base = `/app/o/${access.organizationId}/proformi/${param(req, 'id')}`;
    const email = EmailSchema.safeParse((req.body as Record<string, unknown>)['email']);
    if (!email.success) return res.redirect(303, `${base}?err=noEmail`);
    try {
      await sendProforma(access, req.principal!.user.id, param(req, 'id'), email.data);
    } catch (error) {
      if (error instanceof ProformaError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    kickOutbox();
    res.redirect(303, `${base}?ok=sent`);
  });

  router.post('/app/o/:orgId/proformi/:id/otkazhi', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const base = `/app/o/${access.organizationId}/proformi/${param(req, 'id')}`;
    try {
      await cancelProforma(access, req.principal!.user.id, param(req, 'id'));
    } catch (error) {
      if (error instanceof ProformaError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    res.redirect(303, `${base}?ok=cancelled`);
  });

  return router;
}
