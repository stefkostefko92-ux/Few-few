import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { signState, verifyState } from '../crypto.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { buildAuthorizeUrl, refreshLongLivedToken } from '../instagram/oauth.js';
import { encryptSecret } from '../crypto.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import {
  accountToken,
  connectAccount,
  disconnectAccount,
  refreshAccountQuota,
} from '../services/accounts.js';
import { actorOf, setFlash, stringField } from './helpers.js';

const oauthLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const callbackSchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

export const accountRouter: Router = Router();

accountRouter.get(
  '/admin/accounts',
  requireLogin,
  requireCapability('accounts:view'),
  async (_req, res) => {
    const [accounts, brands] = await Promise.all([
      prisma.instagramAccount.findMany({
        orderBy: [{ status: 'asc' }, { username: 'asc' }],
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          _count: { select: { posts: true } },
        },
      }),
      prisma.brand.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
      }),
    ]);
    res.render('admin/accounts', { title: 'Instagram акаунти', accounts, brands });
  },
);

/**
 * Стартът на OAuth е зад вход + право + CSRF: свързваме само наши брандове, само от панела.
 * `state` носи бранда и потребителя, подписани — обратният адрес няма как да бъде подменен.
 */
accountRouter.post(
  '/admin/accounts/connect',
  requireLogin,
  requireCapability('accounts:manage'),
  requireCsrf,
  oauthLimiter,
  async (req, res) => {
    const brand = await prisma.brand.findUnique({
      where: { id: stringField(req.body, 'brandId') },
    });
    if (!brand) {
      setFlash(res, 'error', 'Няма такъв бранд.');
      res.redirect('/admin/accounts');
      return;
    }
    const cfg = config();
    const actor = actorOf(req);
    const state = signState(`${brand.id}:${actor.id}`, cfg.IG_APP_SECRET);
    await audit(actor, { action: 'account.oauth.start', targetType: 'Brand', targetId: brand.id });
    res.redirect(buildAuthorizeUrl(cfg, state));
  },
);

/** Публичен — Meta го вика. Пази се от подписания state (10 мин) и от това, че свързващият е вписан. */
accountRouter.get('/auth/instagram/callback', oauthLimiter, requireLogin, async (req, res) => {
  const parsed = callbackSchema.safeParse(req.query);
  if (!parsed.success) {
    setFlash(res, 'error', 'Instagram не върна code/state.');
    res.redirect('/admin/accounts');
    return;
  }
  const payload = verifyState(parsed.data.state, config().IG_APP_SECRET);
  const actor = actorOf(req);
  const [brandId, starterId] = (payload ?? '').split(':');
  if (!brandId || starterId !== actor.id) {
    await audit(actor, {
      action: 'account.oauth.rejected',
      detail: { reason: 'невалиден или чужд state' },
    });
    setFlash(res, 'error', 'Невалиден или изтекъл OAuth state. Започни свързването отново.');
    res.redirect('/admin/accounts');
    return;
  }
  try {
    const account = await connectAccount(brandId, parsed.data.code);
    await audit(actor, {
      action: 'account.connect',
      targetType: 'InstagramAccount',
      targetId: account.id,
      detail: { username: account.username, brandId },
    });
    setFlash(
      res,
      'ok',
      `Акаунтът @${account.username} е свързан. Токенът е валиден до ${account.tokenExpiresAt.toLocaleDateString('bg-BG')}.`,
    );
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'неизвестна' },
      'свързването на акаунт се провали',
    );
    setFlash(
      res,
      'error',
      'Свързването с Instagram не мина. Провери правата на Meta приложението.',
    );
  }
  res.redirect('/admin/accounts');
});

accountRouter.post(
  '/admin/accounts/:id/disconnect',
  requireLogin,
  requireCapability('accounts:manage'),
  requireCsrf,
  async (req, res) => {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!account) {
      setFlash(res, 'error', 'Няма такъв акаунт.');
      res.redirect('/admin/accounts');
      return;
    }
    await disconnectAccount(account.id);
    await audit(actorOf(req), {
      action: 'account.disconnect',
      targetType: 'InstagramAccount',
      targetId: account.id,
      detail: { username: account.username },
    });
    setFlash(res, 'ok', `@${account.username} е спрян и токенът е унищожен.`);
    res.redirect('/admin/accounts');
  },
);

accountRouter.post(
  '/admin/accounts/:id/refresh-token',
  requireLogin,
  requireCapability('accounts:manage'),
  requireCsrf,
  async (req, res) => {
    const account = await prisma.instagramAccount.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!account || account.status !== 'ACTIVE') {
      setFlash(res, 'error', 'Акаунтът не е активен — нужен е нов OAuth.');
      res.redirect('/admin/accounts');
      return;
    }
    try {
      const renewed = await refreshLongLivedToken(accountToken(account));
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptSecret(renewed.access_token, config().TOKEN_ENC_KEY),
          tokenExpiresAt: new Date(Date.now() + renewed.expires_in * 1000),
        },
      });
      await audit(actorOf(req), {
        action: 'account.token.refresh',
        targetType: 'InstagramAccount',
        targetId: account.id,
      });
      setFlash(res, 'ok', `Токенът на @${account.username} е подновен.`);
    } catch (error) {
      setFlash(
        res,
        'error',
        `Подновяването не мина: ${error instanceof Error ? error.message : 'неизвестна грешка'}`,
      );
    }
    res.redirect('/admin/accounts');
  },
);

accountRouter.post(
  '/admin/accounts/:id/quota',
  requireLogin,
  requireCapability('accounts:view'),
  requireCsrf,
  async (req, res) => {
    try {
      const quota = await refreshAccountQuota(String(req.params.id));
      setFlash(res, 'info', `Квота: ${quota.used}/${quota.total} за последните 24 часа.`);
    } catch (error) {
      setFlash(
        res,
        'error',
        `Квотата не се прочете: ${error instanceof Error ? error.message : 'неизвестна грешка'}`,
      );
    }
    res.redirect('/admin/accounts');
  },
);
