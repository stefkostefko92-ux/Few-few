import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { orgHasFeature } from '../billing/entitlements.js';
import {
  ApiKeyError,
  ApiKeyFormSchema,
  createApiKey,
  MAX_ACTIVE_KEYS,
  revokeApiKey,
} from '../api/keys.js';
import { param } from './app-shared.js';

/**
 * „API ключове“ на фирмата (SPEC 53): списък, нов ключ (показва се веднъж — страницата се рисува
 * направо, ключът никога не е в адрес или в лог), оттегляне. OWNER/ADMIN на пряка фирма.
 */
async function manager(req: Request) {
  const access = await requireOrg(req, 'org.settings');
  if (access.viaFirmId !== null) throw new HttpError(404);
  return access;
}

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

async function render(
  req: Request,
  res: Parameters<Parameters<Router['get']>[1]>[1],
  extra: { created?: { name: string; key: string }; err?: string; ok?: string } = {},
) {
  const access = await manager(req);
  const [org, keys, feature] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { id: true, legalName: true },
    }),
    prisma.apiKey.findMany({
      where: { organizationId: access.organizationId },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      include: { createdBy: { select: { name: true } } },
    }),
    orgHasFeature(access.organizationId, 'api'),
  ]);
  res.set('Cache-Control', 'no-store');
  res.render('app/api-keys', {
    org,
    keys,
    feature,
    max: MAX_ACTIVE_KEYS,
    base: config().PUBLIC_BASE_URL,
    created: extra.created ?? null,
    err: extra.err ?? code(req.query['err']),
    ok: extra.ok ?? code(req.query['ok']),
  });
}

export function appApiKeysRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/api', async (req, res) => {
    await render(req, res);
  });

  router.post('/app/o/:orgId/api', async (req, res) => {
    const access = await manager(req);
    const parsed = ApiKeyFormSchema.safeParse(req.body);
    if (!parsed.success) return render(req, res, { err: 'invalid' });
    try {
      const { key } = await createApiKey(access, req.principal!.user.id, parsed.data);
      return render(req, res, { created: { name: parsed.data.name, key } });
    } catch (error) {
      if (error instanceof ApiKeyError) return render(req, res, { err: error.code });
      throw error;
    }
  });

  router.post('/app/o/:orgId/api/:keyId/ottegli', async (req, res) => {
    const access = await manager(req);
    try {
      await revokeApiKey(access, req.principal!.user.id, param(req, 'keyId'));
    } catch (error) {
      if (error instanceof ApiKeyError) throw new HttpError(404);
      throw error;
    }
    res.redirect(303, `/app/o/${access.organizationId}/api?ok=revoked`);
  });

  return router;
}
