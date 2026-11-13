import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { requireOrg } from '../auth/guards.js';
import { roleCan } from '../auth/roles.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { documentUpload, uploadStatus } from '../http/upload.js';
import { HOUR } from '../time.js';
import { BankFormatError } from '../bank/entries.js';
import {
  DocumentPaymentError,
  ignoreLine,
  importStatement,
  matchLine,
  ReconcileError,
  suggest,
  undoLine,
} from '../bank/reconcile.js';
import { param } from './app-shared.js';

/**
 * „Банка“ (SPEC 54): качване на извлечение (camt.053/CSV), новите постъпления с предложение за
 * фактура, потвърждение (или друг номер), пропускане, отмяна. Четене — `documents.read`; запис —
 * `documents.issue`; план с `bank-matching`.
 */
const uploadLimiter = rateLimit({
  windowMs: HOUR,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

function failure(error: unknown): string | null {
  if (error instanceof ReconcileError || error instanceof BankFormatError) return error.code;
  if (error instanceof DocumentPaymentError)
    return `payment${error.code[0]!.toUpperCase()}${error.code.slice(1)}`;
  return null;
}

async function writer(req: Request) {
  return requireOrg(req, 'documents.issue');
}

export function appBankRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/banka', async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const [org, fresh, done, statements, feature] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true },
      }),
      prisma.bankLine.findMany({
        where: { organizationId: access.organizationId, status: 'NEW' },
        orderBy: [{ bookingDate: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      prisma.bankLine.findMany({
        where: { organizationId: access.organizationId, status: { not: 'NEW' } },
        orderBy: { bookingDate: 'desc' },
        take: 30,
        include: {
          documentPayment: { select: { document: { select: { id: true, number: true } } } },
        },
      }),
      prisma.bankStatement.findMany({
        where: { organizationId: access.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      orgHasFeature(access.organizationId, 'bank-matching', { viaFirmId: access.viaFirmId }),
    ]);
    const suggestions = await Promise.all(
      fresh.map((line) => suggest(access.organizationId, line)),
    );
    res.render('app/bank', {
      org,
      lines: fresh.map((line, i) => ({ line, suggestion: suggestions[i] })),
      done,
      statements,
      feature,
      canWrite: roleCan(access.role, 'documents.issue'),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
      counts: {
        total: Number(req.query['total']) || 0,
        created: Number(req.query['created']) || 0,
      },
    });
  });

  router.post('/app/o/:orgId/banka', uploadLimiter, documentUpload(), async (req, res) => {
    const access = await writer(req);
    const base = `/app/o/${access.organizationId}/banka`;
    const status = uploadStatus(req);
    if (status !== 'ok' || !req.file)
      return res.redirect(303, `${base}?err=${status === 'tooLarge' ? 'tooLarge' : 'file'}`);
    try {
      const result = await importStatement(access, req.principal!.user.id, {
        name: req.file.originalname,
        buffer: req.file.buffer,
      });
      res.redirect(303, `${base}?ok=imported&total=${result.total}&created=${result.created}`);
    } catch (error) {
      const reason = failure(error);
      if (!reason) throw error;
      res.redirect(303, `${base}?err=${reason}`);
    }
  });

  router.post('/app/o/:orgId/banka/:lineId/:action', async (req, res) => {
    const access = await writer(req);
    const base = `/app/o/${access.organizationId}/banka`;
    const lineId = param(req, 'lineId');
    const actor = req.principal!.user.id;
    const action = String(req.params['action']);
    try {
      if (action === 'svarzhi') {
        const number = (req.body as Record<string, unknown>)['number'];
        if (typeof number !== 'string' || !/^\d{1,10}$/.test(number.trim())) {
          return res.redirect(303, `${base}?err=number`);
        }
        await matchLine(access, actor, lineId, number);
      } else if (action === 'propusni') {
        await ignoreLine(access, actor, lineId);
      } else if (action === 'otmeni') {
        await undoLine(access, actor, lineId);
      } else {
        return res.redirect(303, base);
      }
    } catch (error) {
      const reason = failure(error);
      if (!reason) throw error;
      return res.redirect(303, `${base}?err=${reason}`);
    }
    res.redirect(303, `${base}?ok=${action}`);
  });

  return router;
}
