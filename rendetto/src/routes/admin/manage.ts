import { Router } from 'express';
import { audit, verifyAuditChain } from '../../audit.js';
import { renderError, requireStaff } from '../../auth/guards.js';
import { assignableRoles, outranks } from '../../auth/rbac.js';
import { prisma } from '../../db.js';
import { exportLimiter } from '../../http/limits.js';
import { rawField, stringField } from '../../http/meta.js';
import { LOCALES } from '../../i18n.js';
import { LABEL } from '../../labels.js';
import { withVatCents } from '../../plans/pricing.js';
import {
  paidStartAllowedFrom,
  refundDeadline,
  withdrawalLastDay,
  withdrawalOutcomeOf,
} from '../../plans/withdrawal.js';
import { createAccount } from '../../services/admin-create.js';
import { rejectRequest } from '../../services/admin-plan.js';
import { buildExport, contentDisposition } from '../../services/exports.js';
import { finish, idParam, staffActor } from './common.js';

export const manageRouter: Router = Router();

/* --------------------------------- нов акаунт --------------------------------- */

manageRouter.get('/admin/accounts-new', requireStaff('accounts:create'), (req, res) => {
  res.render('admin/account-new', {
    roles: ['CUSTOMER', ...assignableRoles(staffActor(req).role).filter((r) => r !== 'CUSTOMER')],
    locales: LOCALES,
  });
});

manageRouter.post('/admin/accounts-new', requireStaff('accounts:create'), async (req, res) => {
  const result = await createAccount(staffActor(req), {
    email: stringField(req.body, 'email', 254),
    name: stringField(req.body, 'name', 80),
    role: stringField(req.body, 'role', 20) || 'CUSTOMER',
    plan: stringField(req.body, 'plan', 10) || 'TRIAL',
    trialDays: stringField(req.body, 'trialDays', 4) || '30',
    months: stringField(req.body, 'months', 4) || '1',
    password: rawField(req.body, 'password') || undefined,
    locale: stringField(req.body, 'locale', 5) || 'bg',
  });
  finish(
    res,
    result,
    'flash.accountCreated',
    result.ok && result.id ? `/admin/accounts/${result.id}` : '/admin/accounts-new',
  );
});

/* ------------------------------- заявки за план ------------------------------- */

manageRouter.get('/admin/requests', requireStaff('accounts:view'), async (req, res) => {
  const status = req.query.status === 'all' ? 'all' : 'OPEN';
  const rows = await prisma.upgradeRequest.findMany({
    where: status === 'all' ? {} : { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, email: true, name: true, plan: true, planExpiresAt: true } },
      planChanges: { where: { note: LABEL.withdrawal }, select: { id: true }, take: 1 },
    },
  });
  const now = new Date();
  const requests = rows.map((r) => ({
    ...r,
    withVatCents: withVatCents(r.listPriceCents),
    activationFrom: paidStartAllowedFrom(r),
    lastDay: withdrawalLastDay(r.createdAt),
    refundBy: r.withdrawnAt ? refundDeadline(r.withdrawnAt) : null,
    planOutcome: r.status === 'WITHDRAWN' ? withdrawalOutcomeOf(r) : null,
  }));
  res.render('admin/requests', { requests, status, now });
});

manageRouter.post(
  '/admin/requests/:id/reject',
  requireStaff('requests:handle'),
  async (req, res) => {
    finish(
      res,
      await rejectRequest(staffActor(req), idParam(req)),
      'flash.requestRejected',
      '/admin/requests',
    );
  },
);

/* ------------------------------------ одит ------------------------------------ */

manageRouter.get('/admin/audit', requireStaff('audit:view'), async (req, res) => {
  const before = Number.parseInt(String(req.query.before ?? ''), 10);
  const action = typeof req.query.action === 'string' ? req.query.action.slice(0, 60) : '';
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(Number.isFinite(before) ? { id: { lt: before } } : {}),
      ...(action ? { action: { startsWith: action } } : {}),
    },
    orderBy: { id: 'desc' },
    take: 100,
  });
  res.render('admin/audit', { rows, chain: await verifyAuditChain(), action });
});

/* ----------------------------- проект на клиент ----------------------------- */

/** Персоналът изтегля проекта на клиент само за поддръжка — и това влиза в одита. */
manageRouter.get(
  '/admin/projects/:id/export',
  requireStaff('accounts:security'),
  exportLimiter,
  async (req, res) => {
    const id = idParam(req);
    const project = id
      ? await prisma.project.findUnique({
          where: { id },
          include: { user: { select: { name: true, role: true } } },
        })
      : null;
    if (!project) {
      renderError(res, 404, 'error.notFoundTitle', 'error.notFoundText');
      return;
    }
    const actor = staffActor(req);
    // като всяко действие върху акаунт: само проект на някого с по-нисък ранг
    if (!outranks(actor.role, project.user.role)) {
      renderError(res, 403, 'error.forbiddenTitle', 'error.noCapability');
      return;
    }
    await audit(actor, {
      action: 'admin.project.exported',
      targetType: 'project',
      targetId: project.id,
      detail: { userId: project.userId },
    });
    const file = buildExport(project, project.user.name, 'project.zip');
    res
      .set('Content-Type', file.mime)
      .set('Content-Disposition', contentDisposition(file.name))
      .send(file.body);
  },
);
