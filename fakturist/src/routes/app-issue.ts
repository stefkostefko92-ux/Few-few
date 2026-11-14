import { isSubmissionClash, issuedWithToken, submissionToken } from '../documents/submission.js';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg, type OrgAccess } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import {
  issueDocument,
  IssueRejected,
  IssueRequestSchema,
  SeriesExhausted,
} from '../documents/issue.js';
import { formToIssueRequest, inputToFormValues } from '../documents/form.js';
import { isPdfLanguage } from '../documents/pdf-labels.js';
import { AnnulError, isAnnulReason, replaceable, type AnnulReason } from '../documents/annul.js';
import { kickOutbox } from '../mail/outbox.js';
import { buyerFromParty, saveBuyerAsParty } from '../catalog/document-prefill.js';
import { annulProtocolPdf } from '../documents/annul-protocol.js';
import { createProforma, ProformaRequestSchema } from '../proforma/proforma.js';
import { ProformaError } from '../proforma/link.js';
import { PeppolError } from '../peppol/participants.js';
import { param } from './app-shared.js';
import {
  ANNUL_MESSAGES,
  bodyString,
  PROFORMA_MESSAGES,
  renderNewDocument,
} from './app-issue-view.js';
import { ID } from '../ids.js';
import { sofiaToday } from '../time.js';

const PEPPOL_NOT_ACTIVE = {
  bg: 'Фирмата не е регистрирана за Peppol — включете я от „Peppol“.',
  en: 'The company is not registered for Peppol — enable it under “Peppol”.',
};

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
        pdfLanguage: old.pdfLanguage,
        replaces: old.id,
      });
    }
    // „Издай фактура“ от проформа: формата идва с нейните данни и днешни дати.
    const fromProforma = req.query['ot-proforma'];
    if (typeof fromProforma === 'string') {
      const proforma = ID.test(fromProforma)
        ? await prisma.proforma.findFirst({
            where: { id: fromProforma, organizationId: access.organizationId, status: 'OPEN' },
            select: { id: true, input: true, pdfLanguage: true },
          })
        : null;
      if (!proforma) throw new HttpError(404);
      const today = sofiaToday();
      return renderNewDocument(req, res, access.organizationId, null, {
        ...inputToFormValues(proforma.input),
        typeCode: '380',
        issueDate: today,
        taxPointDate: today,
        pdfLanguage: proforma.pdfLanguage,
        fromProforma: proforma.id,
      });
    }
    // „Документ към него“ от контрагентите: получателят идва попълнен.
    const buyer = await buyerFromParty(access.organizationId, req.query['party']);
    // „Нова проформа“ от списъка: видът идва избран.
    const kind = req.query['vid'] === 'proforma' ? { typeCode: 'proforma' } : {};
    await renderNewDocument(req, res, access.organizationId, null, {
      ...kind,
      ...(buyer ? { buyer } : {}),
    });
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
    if (bodyString(req, 'typeCode') === 'proforma' && !replacesId) {
      return createProformaFromForm(req, res, access);
    }
    const fromProforma = bodyString(req, 'fromProforma');
    if (fromProforma !== undefined && !ID.test(fromProforma)) throw new HttpError(400);
    const request = IssueRequestSchema.safeParse(formToIssueRequest(req.body));
    if (!request.success) {
      const issues = request.error.issues.map((issue) => ({
        rule: 'INPUT',
        path: issue.path.join('.'),
        message: { bg: issue.message, en: issue.message },
      }));
      return renderNewDocument(req, res, access.organizationId, issues, req.body, 400);
    }
    // Двоен клик / повторно изпращане: ключът вече е издал документ → към него, не втори номер.
    const userId = req.principal!.user.id;
    const token = submissionToken(bodyString(req, 'issueToken'));
    const issuedPath = (id: string) => `/app/o/${access.organizationId}/d/${id}?issued=1`;
    const earlier = token
      ? await issuedWithToken({ userId, token, organizationId: access.organizationId })
      : null;
    if (earlier) return res.redirect(303, issuedPath(earlier));
    try {
      const language = bodyString(req, 'pdfLanguage');
      const result = await issueDocument(access, userId, request.data, {
        replaces,
        pdfLanguage: isPdfLanguage(language) ? language : 'bg',
        fromProforma,
        peppol: bodyString(req, 'sendPeppol') === 'on',
        ...(token ? { submission: { userId, token } } : {}),
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
      res.redirect(303, issuedPath(result.id));
    } catch (error) {
      if (token && isSubmissionClash(error)) {
        const done = await issuedWithToken({
          userId,
          token,
          organizationId: access.organizationId,
        });
        if (done) return res.redirect(303, issuedPath(done));
      }
      if (error instanceof IssueRejected) {
        return renderNewDocument(req, res, access.organizationId, error.issues, req.body, 400);
      }
      if (error instanceof PeppolError) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [{ rule: 'PEPPOL', path: 'sendPeppol', message: PEPPOL_NOT_ACTIVE }],
          req.body,
          400,
        );
      }
      if (
        error instanceof ProformaError &&
        (error.code === 'notOpen' || error.code === 'type' || error.code === 'buyer')
      ) {
        return renderNewDocument(
          req,
          res,
          access.organizationId,
          [{ rule: 'PROFORMA', path: 'fromProforma', message: PROFORMA_MESSAGES[error.code] }],
          req.body,
          400,
        );
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

/** Проформа от формата: същият вход и същите проверки като фактура, своя номерация (src/proforma/). */
async function createProformaFromForm(req: Request, res: Response, access: OrgAccess) {
  const parsed = ProformaRequestSchema.safeParse({
    ...(formToIssueRequest(req.body) as Record<string, unknown>),
    typeCode: '380',
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      rule: 'INPUT',
      path: issue.path.join('.'),
      message: { bg: issue.message, en: issue.message },
    }));
    return renderNewDocument(req, res, access.organizationId, issues, req.body, 400);
  }
  try {
    const language = bodyString(req, 'pdfLanguage');
    const created = await createProforma(
      access,
      req.principal!.user.id,
      parsed.data,
      isPdfLanguage(language) ? language : 'bg',
    );
    if (bodyString(req, 'saveBuyer') === 'on') {
      await saveBuyerAsParty({
        organizationId: access.organizationId,
        actorId: req.principal!.user.id,
        buyer: (req.body as { buyer?: unknown }).buyer,
      });
    }
    res.redirect(303, `/app/o/${access.organizationId}/proformi/${created.id}?ok=created`);
  } catch (error) {
    if (error instanceof IssueRejected) {
      return renderNewDocument(req, res, access.organizationId, error.issues, req.body, 400);
    }
    throw error;
  }
}
