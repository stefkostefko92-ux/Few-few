import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { encryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { AGENT_SCOPES } from '../agent/auth.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { actorOf, humanIdOf, setFlash, stringField } from './helpers.js';

const keySchema = z.object({
  name: z.string().min(2).max(80),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1),
  brandIds: z.array(z.string().min(1)),
  allowedIps: z.array(z.string().ip()),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

function listField(body: unknown, key: string): string[] {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

export const keyRouter: Router = Router();
keyRouter.use('/admin/keys', requireLogin, requireCapability('keys:manage'));

keyRouter.get('/admin/keys', async (_req, res) => {
  const [keys, brands] = await Promise.all([
    prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { email: true } } },
    }),
    prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  res.render('admin/keys', {
    title: 'Агентски ключове',
    keys,
    brands,
    scopes: AGENT_SCOPES,
    created: null,
  });
});

/** Тайната се показва ЕДИН път — после в базата има само криптираната ѝ форма. */
keyRouter.post('/admin/keys', requireCsrf, async (req, res) => {
  const input = keySchema.safeParse({
    name: stringField(req.body, 'name'),
    scopes: listField(req.body, 'scopes'),
    brandIds: listField(req.body, 'brandIds'),
    allowedIps: listField(req.body, 'allowedIps'),
    expiresInDays: stringField(req.body, 'expiresInDays') || undefined,
  });
  if (!input.success) {
    setFlash(
      res,
      'error',
      `Невалиден ключ: ${input.error.issues.map((issue) => issue.message).join('; ')}`,
    );
    res.redirect('/admin/keys');
    return;
  }
  const secret = `pk_${randomBytes(32).toString('base64url')}`;
  const key = await prisma.apiKey.create({
    data: {
      name: input.data.name,
      secretEnc: encryptSecret(secret, config().TOKEN_ENC_KEY),
      scopes: input.data.scopes,
      brandIds: input.data.brandIds,
      allowedIps: input.data.allowedIps,
      expiresAt: input.data.expiresInDays
        ? new Date(Date.now() + input.data.expiresInDays * 24 * 3600 * 1000)
        : null,
      createdById: humanIdOf(req),
    },
  });
  await audit(actorOf(req), {
    action: 'apikey.create',
    targetType: 'ApiKey',
    targetId: key.id,
    detail: {
      name: key.name,
      scopes: key.scopes,
      brands: key.brandIds.length,
      ips: key.allowedIps.length,
    },
  });
  const [keys, brands] = await Promise.all([
    prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { email: true } } },
    }),
    prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  res.render('admin/keys', {
    title: 'Агентски ключове',
    keys,
    brands,
    scopes: AGENT_SCOPES,
    created: { id: key.id, secret, name: key.name, baseUrl: config().PUBLIC_BASE_URL },
  });
});

keyRouter.post('/admin/keys/:id/revoke', requireCsrf, async (req, res) => {
  const key = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!key || key.revokedAt) {
    setFlash(res, 'error', 'Ключът не е намерен или вече е отменен.');
    res.redirect('/admin/keys');
    return;
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await audit(actorOf(req), {
    action: 'apikey.revoke',
    targetType: 'ApiKey',
    targetId: key.id,
    detail: { name: key.name },
  });
  setFlash(res, 'ok', `Ключът „${key.name}“ е отменен — подписите му вече не се приемат.`);
  res.redirect('/admin/keys');
});
