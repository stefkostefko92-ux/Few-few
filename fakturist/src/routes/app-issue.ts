import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import {
  issueDocument,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { formToIssueRequest, inputToFormValues } from '../documents/form.js';
import {
  ANNUL_REASONS,
  AnnulError,
  isAnnulReason,
  replaceable,
  type AnnulReason,
} from '../documents/annul.js';
import { COMMON_UNITS, PAYMENT_MEANS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { kickOutbox } from '../mail/outbox.js';
import { buyerFromParty, catalogForForm, saveBuyerAsParty } from '../catalog/document-prefill.js';
import { annulProtocolPdf } from '../documents/annul-protocol.js';
import { param } from './app-shared.js';

type Issue = { rule: string; path: string; message: { bg: string; en: string } };

const ANNUL_MESSAGES: Record<AnnulError['code'], { bg: string; en: string }> = {
  notFound: {
    bg: 'Документът за анулиране не е намерен.',
    en: 'The document to annul was not found.',
  },
  notIssued: {
    bg: 'Документът вече е анулиран или не е издаден.',
    en: 'The document is already annulled or not issued.',
  },
  hasFollowers: {
    bg: 'Към документа има издадени известия — поправката е чрез известие, не чрез анулиране.',
    en: 'Notes have been issued for this document — correct it with a note, not by annulment.',
  },
  typeMismatch: {
    bg: 'Новият документ трябва да е от същия вид като анулирания.',
    en: 'The new document must be of the same type as the annulled one.',
  },
  invalidReason: {
    bg: 'Изберете основанието за анулиране.',
    en: 'Choose the reason for the annulment.',
  },
};

function bodyString(req: Request, name: string): string | undefined {
  const value = (req.body as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Издаването от формата (views/app/document-new.ejs): нов документ, предварително попълнен от контрагент
 * (`?party=`) или — „Анулирай и издай нов“ (`?zamenya=`, SPEC 47) — от анулирания документ.
 */
export function appIssueRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/nov', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const replacing = req.query['zamenya'];
    if (typeof replacing === 'string') {
      if (!roleCan(access.role, 'documents.cancel')) throw new HttpError(404);
      const old = await prisma
        .$transaction((tx) => replaceable(tx, access.organizationId, replacing))
        .catch((error: unknown) => {
          if (error instanceof AnnulError) throw new HttpError(404);
          throw error;
        });
      return renderNewDocument(req, res, access.organizationId, null, {
        ...inputToFormValues(old.input),
        replaces: old.id,
      });
    }
    // „Документ към него“ от контрагентите: получателят идва попълнен.
    const buyer = await buyerFromParty(access.organizationId, req.query['party']);
    await renderNewDocument(req, res, access.organizationId, null, buyer ? { buyer } : {});
  });

  router.post('/app/o/:orgId/nov', async (req, res) => {
    const access = await requireOrg(req, 'documents.issue');
    const replacesId = bodyString(req, 'replaces');
    const reason = bodyString(req, 'annulReason');
    let replaces: { documentId: string; reason: AnnulReason } | undefined;
    if (replacesId) {
      if (!roleCan(access.role, 'documents.cancel')) throw new HttpError(404);
      if (!isAnnulReason(reason)) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [{ rule: 'ANNUL', path: 'annulReason', message: ANNUL_MESSAGES.invalidReason }],
          req.body,
          400,
        );
      }
      replaces = { documentId: replacesId, reason };
    }
    const request = IssueRequestSchema.safeParse(formToIssueRequest(req.body));
    if (!request.success) {
      const issues = request.error.issues.map((issue) => ({
        rule: 'INPUT',
        path: issue.path.join('.'),
        message: { bg: issue.message, en: issue.message },
      }));
      return renderNewDocument(req, res, access.organizationId, issues, req.body, 400);
    }
    try {
      const result = await issueDocument(access, req.principal!.user.id, request.data, {
        replaces,
      });
      if (bodyString(req, 'saveBuyer') === 'on') {
        await saveBuyerAsParty({
          organizationId: access.organizationId,
          actorId: req.principal!.user.id,
          buyer: (req.body as { buyer?: unknown }).buyer,
        });
      }
      // Писмата към шкафчето (и известията за анулирането) тръгват веднага след транзакцията.
      if (result.delivery || replaces) kickOutbox();
      res.redirect(303, `/app/o/${access.organizationId}/d/${result.id}?issued=1`);
    } catch (error) {
      if (error instanceof IssueRejected) {
        return renderNewDocument(req, res, access.organizationId, error.issues, req.body, 400);
      }
      if (error instanceof AnnulError) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [{ rule: 'ANNUL', path: 'replaces', message: ANNUL_MESSAGES[error.code] }],
          req.body,
          400,
        );
      }
      if (error instanceof SeriesExhausted) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [
            {
              rule: 'SERIES',
              path: 'seriesId',
              message: { bg: 'Серията е изчерпана.', en: 'The series is exhausted.' },
            },
          ],
          req.body,
          400,
        );
      }
      throw error;
    }
  });

  // Протоколът за анулиране (чл. 116, ал. 4 ЗДДС) — само за анулиран документ на фирмата.
  router.get('/app/o/:orgId/d/:docId/protokol.pdf', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const document = await prisma.document.findFirst({
      where: {
        id: param(req, 'docId'),
        organizationId: access.organizationId,
        status: 'CANCELLED',
      },
      select: {
        organizationId: true,
        number: true,
        typeCode: true,
        issueDate: true,
        input: true,
        cancelledAt: true,
        cancelReason: true,
        cancelledBy: { select: { name: true } },
        replacedBy: { select: { number: true, issueDate: true } },
      },
    });
    if (!document) throw new HttpError(404);
    const pdf = await annulProtocolPdf(document);
    res
      .set('Cache-Control', 'private, no-store')
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="protokol-${document.number ?? 'doc'}.pdf"`)
      .send(pdf);
  });

  return router;
}

async function renderNewDocument(
  req: Request,
  res: Response,
  organizationId: string,
  issues: Issue[] | null,
  values: unknown,
  status = 200,
): Promise<void> {
  const form =
    typeof values === 'object' && values !== null ? (values as Record<string, unknown>) : {};
  const replacesId = typeof form['replaces'] === 'string' ? form['replaces'] : null;
  const [org, series, catalog, replacing] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.documentSeries.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    catalogForForm(organizationId),
    replacesId
      ? prisma.document.findFirst({
          where: { id: replacesId, organizationId },
          select: { id: true, number: true, issueDate: true, typeCode: true },
        })
      : Promise.resolve(null),
  ]);
  // qs дава масив до 20 реда, а над това — обект с ключове „0“, „1“… (src/documents/form.ts, list()).
  const rawLines = form['lines'];
  const lines = Array.isArray(rawLines)
    ? rawLines.length
    : typeof rawLines === 'object' && rawLines !== null
      ? Object.keys(rawLines).length
      : 0;
  const today = new Date().toISOString().slice(0, 10);
  res.status(status).render('app/document-new', {
    org,
    series,
    parties: catalog.parties,
    items: catalog.items,
    scripts: ['document-form'],
    issues,
    values: form,
    replacing,
    annulReasons: ANNUL_REASONS,
    today,
    units: COMMON_UNITS,
    categories: VAT_CATEGORIES,
    paymentMeans: PAYMENT_MEANS,
    lineCount: Math.max(6, lines + 1),
    canIssue: true,
    reqPath: req.path,
  });
}
