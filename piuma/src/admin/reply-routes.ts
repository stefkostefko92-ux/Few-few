import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { hasCommentsScope, messageBytes } from '../replies/decide.js';
import { WEBHOOK_PATH } from '../replies/webhook-routes.js';
import {
  ReplyRuleError,
  approveRule,
  createRule,
  deleteRule,
  footerFor,
  replyStats,
  setRulePaused,
  subscribeAccount,
  updateRule,
  type RuleForm,
} from '../services/replies.js';
import { actorOf, setFlash, stringField, tr } from './helpers.js';

/**
 * „Отговор по ключова дума“ в панела (docs/private-replies.md). Пише редактор, пуска ревюър,
 * който не е авторът; акаунт без правото за коментари не може да има активно правило.
 */
export const replyRouter: Router = Router();
replyRouter.use('/admin/accounts/:id/replies', requireLogin);
replyRouter.use('/admin/replies', requireLogin);

function formOf(body: unknown): RuleForm {
  return {
    keyword: stringField(body, 'keyword'),
    message: stringField(body, 'message'),
    mediaId: stringField(body, 'mediaId'),
    announced: stringField(body, 'announced') === 'on',
  };
}

const pageOf = (accountId: string) => `/admin/accounts/${accountId}/replies`;

/** Човекът зад сесията — `actorOf` винаги има id, тук го казваме и на типа. */
function human(req: Request) {
  const actor = actorOf(req);
  if (!actor.id) throw new Error('Няма вписан потребител.');
  return { ...actor, id: actor.id };
}

/** Грешка към човека → превод; всичко друго е наша грешка — в лога, с общо съобщение. */
function fail(res: Response, error: unknown): void {
  if (error instanceof ReplyRuleError) {
    setFlash(res, 'error', tr(res, error.key));
    return;
  }
  logger.error(
    { err: error instanceof Error ? error.message : 'неизвестна' },
    'действие по правило за лични съобщения се провали',
  );
  setFlash(res, 'error', tr(res, 'flash.unknownError'));
}

async function accountOfRule(ruleId: string): Promise<string | null> {
  const rule = await prisma.replyRule.findUnique({
    where: { id: ruleId },
    select: { accountId: true },
  });
  return rule?.accountId ?? null;
}

replyRouter.get(
  '/admin/accounts/:id/replies',
  requireCapability('accounts:view'),
  async (req, res) => {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: String(req.params.id) },
      include: { brand: true },
    });
    if (!account) {
      res.status(404).render('admin/error', {
        title: tr(res, 'error.notFoundTitle'),
        message: tr(res, 'flash.noAccount'),
      });
      return;
    }
    const cfg = config();
    const [rules, posts, stats] = await Promise.all([
      prisma.replyRule.findMany({
        where: { accountId: account.id },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.post.findMany({
        where: { accountId: account.id, status: 'PUBLISHED', igMediaId: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 50,
        select: { igMediaId: true, caption: true, publishedAt: true },
      }),
      replyStats(account.id),
    ]);
    // Бележката с примерна дума — за да види редакторът колко място остава.
    const footer = footerFor(account.brand, 'ЦЕНА');
    res.render('admin/replies', {
      title: tr(res, 'replies.title', { username: account.username }),
      account,
      rules,
      posts,
      stats,
      footer,
      footerBytes: messageBytes(`\n\n${footer}`),
      featureOn: Boolean(cfg.IG_WEBHOOK_VERIFY_TOKEN),
      scopeOk: hasCommentsScope(account.scopes),
      legalOk: Boolean(cfg.REPLY_PRIVACY_URL),
      webhookUrl: `${cfg.PUBLIC_BASE_URL}${WEBHOOK_PATH}`,
      retentionDays: cfg.PRIVATE_REPLIES_RETENTION_DAYS,
    });
  },
);

replyRouter.post(
  '/admin/accounts/:id/replies',
  requireCapability('replies:edit'),
  requireCsrf,
  async (req, res) => {
    const accountId = String(req.params.id);
    try {
      await createRule(human(req), accountId, formOf(req.body));
      setFlash(res, 'ok', tr(res, 'flash.ruleCreated'));
    } catch (error) {
      fail(res, error);
    }
    res.redirect(pageOf(accountId));
  },
);

replyRouter.post(
  '/admin/accounts/:id/replies/subscribe',
  requireCapability('accounts:manage'),
  requireCsrf,
  async (req, res) => {
    const accountId = String(req.params.id);
    try {
      await subscribeAccount(human(req), accountId);
      const account = await prisma.instagramAccount.findUniqueOrThrow({
        where: { id: accountId },
        select: { username: true },
      });
      setFlash(res, 'ok', tr(res, 'flash.commentsSubscribed', { username: account.username }));
    } catch (error) {
      fail(res, error);
    }
    res.redirect(pageOf(accountId));
  },
);

/** Общият скелет на действие по едно правило: намери акаунта, изпълни, върни на страницата. */
async function onRule(
  req: Request,
  res: Response,
  action: (ruleId: string) => Promise<unknown>,
  okKey: string,
): Promise<void> {
  const ruleId = String(req.params.ruleId);
  const accountId = await accountOfRule(ruleId);
  if (!accountId) {
    setFlash(res, 'error', tr(res, 'replies.errMissing'));
    res.redirect('/admin/accounts');
    return;
  }
  try {
    await action(ruleId);
    setFlash(res, 'ok', tr(res, okKey));
  } catch (error) {
    fail(res, error);
  }
  res.redirect(pageOf(accountId));
}

replyRouter.post(
  '/admin/replies/:ruleId',
  requireCapability('replies:edit'),
  requireCsrf,
  (req, res) =>
    onRule(req, res, (id) => updateRule(human(req), id, formOf(req.body)), 'flash.ruleSaved'),
);

replyRouter.post(
  '/admin/replies/:ruleId/approve',
  requireCapability('replies:approve'),
  requireCsrf,
  (req, res) =>
    onRule(
      req,
      res,
      (id) => approveRule(human(req), id, stringField(req.body, 'confirm') === 'on'),
      'flash.ruleApproved',
    ),
);

replyRouter.post(
  '/admin/replies/:ruleId/pause',
  requireCapability('replies:approve'),
  requireCsrf,
  (req, res) => onRule(req, res, (id) => setRulePaused(human(req), id, true), 'flash.rulePaused'),
);

replyRouter.post(
  '/admin/replies/:ruleId/resume',
  requireCapability('replies:approve'),
  requireCsrf,
  (req, res) => onRule(req, res, (id) => setRulePaused(human(req), id, false), 'flash.ruleResumed'),
);

replyRouter.post(
  '/admin/replies/:ruleId/delete',
  requireCapability('replies:approve'),
  requireCsrf,
  (req, res) => onRule(req, res, (id) => deleteRule(human(req), id), 'flash.ruleDeleted'),
);
