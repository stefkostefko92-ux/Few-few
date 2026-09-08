import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { signState, verifyState } from '../crypto.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { buildAuthorizeUrl } from '../instagram/oauth.js';
import { connectAccount } from '../services/accounts.js';
import { requireAdmin } from './admin-auth.js';

const oauthLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true });

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const oauthRouter: Router = Router();

/** Стартът иска админ токен — свързваме само наши брандове. */
oauthRouter.get('/auth/instagram/start', oauthLimiter, requireAdmin, async (req, res) => {
  const slug = z.string().min(1).safeParse(req.query.brand);
  if (!slug.success) {
    res.status(400).json({ error: 'Липсва ?brand=<slug>.' });
    return;
  }
  const brand = await prisma.brand.findUnique({ where: { slug: slug.data } });
  if (!brand) {
    res.status(404).json({ error: 'Няма такъв бранд.' });
    return;
  }
  const cfg = config();
  const state = signState(brand.id, cfg.IG_APP_SECRET);
  res.redirect(buildAuthorizeUrl(cfg, state));
});

/** Обратният адрес е публичен (Meta го вика) — пази се от подписания `state`. */
oauthRouter.get('/auth/instagram/callback', oauthLimiter, async (req, res) => {
  const parsed = callbackSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Липсва code или state.' });
    return;
  }
  const brandId = verifyState(parsed.data.state, config().IG_APP_SECRET);
  if (!brandId) {
    res.status(400).json({ error: 'Невалиден или изтекъл state.' });
    return;
  }

  try {
    const account = await connectAccount(brandId, parsed.data.code);
    res.json({
      connected: true,
      username: account.username,
      igUserId: account.igUserId,
      tokenExpiresAt: account.tokenExpiresAt,
    });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'неизвестна' },
      'свързването на акаунт се провали',
    );
    res.status(502).json({ error: 'Свързването с Instagram не мина.' });
  }
});
