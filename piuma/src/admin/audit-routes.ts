import { Router } from 'express';
import { verifyAuditChain } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireCapability, requireLogin } from '../auth/guards.js';
import { pageParam, tr } from './helpers.js';

export const auditRouter: Router = Router();

auditRouter.get('/admin/audit', requireLogin, requireCapability('audit:view'), async (req, res) => {
  const { page, take, skip } = pageParam(req);
  const actionFilter = typeof req.query.action === 'string' ? req.query.action : '';
  const where = actionFilter ? { action: { startsWith: actionFilter } } : {};
  const [rows, total, chain] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
    req.query.verify === '1' ? verifyAuditChain() : Promise.resolve(null),
  ]);
  res.render('admin/audit', {
    title: tr(res, 'audit.title'),
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    actionFilter,
    chain,
  });
});

/** Само факти без тайни: кои настройки са зададени, не какви са. */
auditRouter.get(
  '/admin/settings',
  requireLogin,
  requireCapability('settings:view'),
  async (_req, res) => {
    const cfg = config();
    const [users, keys, sessions] = await Promise.all([
      prisma.user.count({ where: { active: true } }),
      prisma.apiKey.count({ where: { revokedAt: null } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ]);
    res.render('admin/settings', {
      title: tr(res, 'settings.title'),
      settings: {
        environment: cfg.NODE_ENV,
        publicBaseUrl: cfg.PUBLIC_BASE_URL,
        graphVersion: cfg.IG_GRAPH_VERSION,
        scopes: cfg.IG_SCOPES.split(','),
        redirectUri: cfg.IG_REDIRECT_URI,
        appIdSet: Boolean(cfg.IG_APP_ID),
        anthropicSet: Boolean(cfg.ANTHROPIC_API_KEY),
        totpIssuer: cfg.TOTP_ISSUER,
        trustProxy: cfg.TRUST_PROXY,
      },
      stats: { users, keys, sessions },
    });
  },
);
