import { Router } from 'express';
import { renderError, requireStaff } from '../../auth/guards.js';
import { assignableRoles, can, outranks } from '../../auth/rbac.js';
import { remainingRecoveryCodes } from '../../auth/recovery.js';
import { idParam, stringField } from '../../http/meta.js';
import { planView } from '../../plans/plan.js';
import { optionPriceCents, priceTable } from '../../plans/pricing.js';
import { paidStartAllowedFrom } from '../../plans/withdrawal.js';
import { accountDetail } from '../../services/admin-accounts.js';
import {
  accountAudit,
  accountIpSummary,
  accountLogins,
  linkedAccounts,
} from '../../services/admin-insights.js';
import { changeRole, editAccount } from '../../services/admin-actions.js';
import { ADMIN_LIMITS } from '../../services/admin-limits.js';
import { changePlan } from '../../services/admin-plan.js';
import {
  banAccount,
  deleteAccount,
  resetTwoFactor,
  revokeSessions,
  sendPasswordReset,
  unbanAccount,
  unlockAccount,
} from '../../services/admin-security.js';
import { bool, finish, staffActor } from './common.js';

export const accountAdminRouter: Router = Router();

accountAdminRouter.get('/admin/accounts/:id', requireStaff('accounts:view'), async (req, res) => {
  const id = idParam(req);
  const account = id ? await accountDetail(id) : null;
  if (!account) {
    renderError(res, 404, 'error.notFoundTitle', 'error.notFoundText');
    return;
  }
  const actor = staffActor(req);
  const showLogins = can(actor.role, 'logins:view');
  const [logins, ips, linked, audit, recoveryLeft] = await Promise.all([
    showLogins ? accountLogins(account.id) : Promise.resolve([]),
    showLogins ? accountIpSummary(account.id) : Promise.resolve([]),
    showLogins ? linkedAccounts(account.id) : Promise.resolve([]),
    can(actor.role, 'audit:view') ? accountAudit(account.id) : Promise.resolve([]),
    remainingRecoveryCodes(account.id),
  ]);
  const requestId = typeof req.query.request === 'string' ? req.query.request : '';
  const open = account.upgradeRequests.find((r) => r.id === requestId && r.status === 'OPEN');
  const request = open ? { ...open, allowedFrom: paidStartAllowedFrom(open) } : null;
  res.render('admin/account', {
    account,
    plan: planView(account),
    logins,
    ips,
    linked,
    audit,
    recoveryLeft,
    showLogins,
    request,
    prices: priceTable(),
    lifetimeCents: optionPriceCents('lifetime'),
    manageable: account.id !== actor.id && outranks(actor.role, account.role),
    roles: assignableRoles(actor.role),
    now: new Date(),
  });
});

const path = (id: string) => `/admin/accounts/${id}`;

accountAdminRouter.post(
  '/admin/accounts/:id/edit',
  requireStaff('accounts:edit'),
  async (req, res) => {
    const id = idParam(req);
    const result = await editAccount(staffActor(req), id, {
      name: stringField(req.body, 'name', 80),
      email: stringField(req.body, 'email', 254),
      locale: stringField(req.body, 'locale', 5),
      emailVerified: bool(req.body, 'emailVerified'),
    });
    finish(res, result, 'flash.accountSaved', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/role',
  requireStaff('staff:manage'),
  async (req, res) => {
    const id = idParam(req);
    finish(
      res,
      await changeRole(staffActor(req), id, stringField(req.body, 'role', 20)),
      'flash.roleChanged',
      path(id),
    );
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/plan',
  requireStaff('accounts:plan'),
  async (req, res) => {
    const id = idParam(req);
    const plan = stringField(req.body, 'plan', 10);
    const common = {
      note: stringField(req.body, 'note', ADMIN_LIMITS.noteMax),
      notify: bool(req.body, 'notify'),
      requestId: stringField(req.body, 'requestId', 40) || undefined,
    };
    const raw =
      plan === 'TRIAL'
        ? { plan, days: stringField(req.body, 'days', 4), ...common }
        : plan === 'PREMIUM'
          ? {
              plan,
              mode: stringField(req.body, 'mode', 10),
              months: stringField(req.body, 'months', 4),
              until: stringField(req.body, 'until', 10) || undefined,
              ...common,
            }
          : { plan, ...common };
    finish(res, await changePlan(staffActor(req), id, raw), 'flash.planChanged', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/ban',
  requireStaff('accounts:ban'),
  async (req, res) => {
    const id = idParam(req);
    finish(
      res,
      await banAccount(staffActor(req), id, {
        reason: stringField(req.body, 'reason', ADMIN_LIMITS.banReason.max),
      }),
      'flash.banned',
      path(id),
    );
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/unban',
  requireStaff('accounts:ban'),
  async (req, res) => {
    const id = idParam(req);
    finish(
      res,
      await unbanAccount(staffActor(req), id, {
        note: stringField(req.body, 'note', ADMIN_LIMITS.noteMax),
      }),
      'flash.unbanned',
      path(id),
    );
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/2fa-reset',
  requireStaff('accounts:security'),
  async (req, res) => {
    const id = idParam(req);
    finish(res, await resetTwoFactor(staffActor(req), id), 'flash.twoFactorReset', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/sessions/revoke',
  requireStaff('accounts:security'),
  async (req, res) => {
    const id = idParam(req);
    finish(res, await revokeSessions(staffActor(req), id), 'flash.sessionsRevoked', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/unlock',
  requireStaff('accounts:security'),
  async (req, res) => {
    const id = idParam(req);
    finish(res, await unlockAccount(staffActor(req), id), 'flash.unlocked', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/reset-password',
  requireStaff('accounts:security'),
  async (req, res) => {
    const id = idParam(req);
    finish(res, await sendPasswordReset(staffActor(req), id), 'flash.resetSent', path(id));
  },
);

accountAdminRouter.post(
  '/admin/accounts/:id/delete',
  requireStaff('accounts:delete'),
  async (req, res) => {
    const id = idParam(req);
    const result = await deleteAccount(
      staffActor(req),
      id,
      stringField(req.body, 'confirmEmail', 254),
    );
    finish(res, result, 'flash.accountDeleted', result.ok ? '/admin/accounts' : path(id));
  },
);
