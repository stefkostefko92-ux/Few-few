import { Router } from 'express';
import { prisma } from '../db.js';
import { principalOf, requireCsrf, requireUser } from '../auth/guards.js';
import { clearSessionCookie } from '../auth/sessions.js';
import { setFlash } from '../http/flash.js';
import { resendLimiter, sensitiveLimiter } from '../http/limits.js';
import { rawField, requestMeta, stringField } from '../http/meta.js';
import { LOCALES, type Locale } from '../i18n.js';
import { planView } from '../plans/plan.js';
import { priceTable, VAT_BG_PERCENT, withVatCents } from '../plans/pricing.js';
import {
  canWithdraw,
  paidStartAllowedFrom,
  REFUND_DAYS,
  WITHDRAWAL_DAYS,
  withdrawalLastDay,
} from '../plans/withdrawal.js';
import { deleteOwnAccount, exportOwnData, updateProfile } from '../services/account-self.js';
import { orderPlanName, withdrawalStatement } from '../services/order-mail.js';
import {
  cancelOwnRequest,
  createUpgradeRequest,
  withdrawableOrder,
  withdrawFromOrder,
} from '../services/plan-requests.js';
import { resendVerification } from '../services/registration.js';
import { back, me } from './account-common.js';
import { accountSecurityRouter } from './account-security.js';
import { requestEmailChange } from '../services/security.js';

export const accountRouter: Router = Router();
accountRouter.use('/account', requireUser, requireCsrf, (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
accountRouter.use(accountSecurityRouter);

/* ---------------------------------- преглед и профил ---------------------------------- */

accountRouter.get('/account', async (req, res) => {
  const user = await me(req);
  const [projects, openRequest] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.upgradeRequest.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.render('account/overview', {
    user,
    plan: planView(user),
    projects,
    openRequest,
    locales: LOCALES,
    section: 'overview',
  });
});

accountRouter.post('/account/profile', async (req, res) => {
  const result = await updateProfile(
    await me(req),
    stringField(req.body, 'name', 80),
    stringField(req.body, 'locale', 5),
    requestMeta(req),
  );
  back(res, '/account', result.ok ? 'ok' : 'error', result.ok ? 'flash.profileSaved' : result.key);
});

accountRouter.post('/account/email', sensitiveLimiter, async (req, res) => {
  const result = await requestEmailChange(
    await me(req),
    stringField(req.body, 'email', 254),
    rawField(req.body, 'password'),
    requestMeta(req),
  );
  back(
    res,
    '/account',
    result.ok ? 'info' : 'error',
    result.ok ? 'flash.emailChangeSent' : result.key,
  );
});

accountRouter.post('/account/verify/resend', resendLimiter, async (req, res) => {
  const sent = await resendVerification(await me(req));
  back(
    res,
    '/account',
    sent ? 'info' : 'error',
    sent ? 'flash.verificationResent' : 'flash.verificationNotSent',
  );
});

/* --------------------------------------- план --------------------------------------- */

accountRouter.get('/account/plan', async (req, res) => {
  const user = await me(req);
  const requests = await prisma.upgradeRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const now = new Date();
  res.render('account/plan', {
    user,
    plan: planView(user, now),
    prices: priceTable(),
    vatPercent: VAT_BG_PERCENT,
    requests: requests.map((r) => ({
      ...r,
      withVatCents: withVatCents(r.listPriceCents),
      canWithdraw: canWithdraw(r, now),
      lastDay: withdrawalLastDay(r.createdAt),
      activationFrom: paidStartAllowedFrom(r),
    })),
    now,
    withdrawalDays: WITHDRAWAL_DAYS,
    section: 'plan',
  });
});

accountRouter.post('/account/plan/request', sensitiveLimiter, async (req, res) => {
  const result = await createUpgradeRequest(await me(req), req.body, requestMeta(req));
  back(
    res,
    '/account/plan',
    result.ok ? 'ok' : 'error',
    result.ok ? 'flash.requestSent' : result.key,
  );
});

accountRouter.post('/account/plan/request/:id/cancel', async (req, res) => {
  const ok = await cancelOwnRequest(await me(req), String(req.params.id), requestMeta(req));
  back(
    res,
    '/account/plan',
    ok ? 'ok' : 'error',
    ok ? 'flash.requestCancelled' : 'error.notFoundText',
  );
});

/* -------------------- отказ от договора (чл. 11а от Директива 2011/83) -------------------- */

accountRouter.get('/account/plan/withdraw/:id', async (req, res) => {
  const user = await me(req);
  const order = await withdrawableOrder(user, String(req.params.id));
  if (!order) {
    back(res, '/account/plan', 'error', 'plan.withdraw.unavailable');
    return;
  }
  res.render('account/withdraw', {
    user,
    order,
    planName: orderPlanName(order, res.locals.locale as Locale),
    statement: withdrawalStatement(order, user, res.locals.locale as Locale),
    lastDay: withdrawalLastDay(order.createdAt),
    refundDays: REFUND_DAYS,
    section: 'plan',
  });
});

accountRouter.post('/account/plan/withdraw/:id', sensitiveLimiter, async (req, res) => {
  const result = await withdrawFromOrder(await me(req), String(req.params.id), requestMeta(req));
  back(
    res,
    '/account/plan',
    result.ok ? 'ok' : 'error',
    result.ok ? 'flash.withdrawn' : result.key,
  );
});

/* --------------------------------------- данни --------------------------------------- */

accountRouter.get('/account/data', async (req, res) => {
  const user = await me(req);
  res.render('account/data', { user, section: 'data' });
});

accountRouter.post('/account/data/export', sensitiveLimiter, async (req, res) => {
  const data = await exportOwnData(principalOf(req).user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  res
    .set('Content-Type', 'application/json; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="rendetto-data-${stamp}.json"`)
    .send(`${JSON.stringify(data, null, 2)}\n`);
});

accountRouter.post('/account/data/delete', sensitiveLimiter, async (req, res) => {
  const result = await deleteOwnAccount(
    await me(req),
    {
      password: rawField(req.body, 'password'),
      code: stringField(req.body, 'code', 20),
      confirmed: stringField(req.body, 'confirm') === 'yes',
    },
    requestMeta(req),
  );
  if (!result.ok) {
    back(res, '/account/data', 'error', result.key);
    return;
  }
  clearSessionCookie(res);
  setFlash(res, 'ok', 'flash.accountDeleted');
  res.redirect('/login');
});
