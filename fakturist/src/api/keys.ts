import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { OrgAccess } from '../auth/guards.js';
import { orgHasFeature } from '../billing/entitlements.js';

/**
 * API ключовете на фирмата (SPEC 53): „fkt_“ + 32 случайни байта (base64url). Показва се веднъж; в
 * базата е само SHA-256 и началото за разпознаване в списъка. Обхват: „read“ и/или „issue“. Създава
 * и оттегля OWNER/ADMIN на пряка фирма (`org.settings`); ключът работи само докато планът има `api`.
 */
export const API_SCOPES = ['read', 'issue'] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const MAX_ACTIVE_KEYS = 10;
const KEY_PATTERN = /^fkt_[A-Za-z0-9_-]{43}$/;

export class ApiKeyError extends Error {
  constructor(readonly code: 'feature' | 'limit' | 'notFound') {
    super(code);
  }
}

export const ApiKeyFormSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length)),
});
export type ApiKeyForm = z.infer<typeof ApiKeyFormSchema>;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function createApiKey(
  access: OrgAccess,
  actorId: string,
  form: ApiKeyForm,
): Promise<{ id: string; key: string }> {
  if (!(await orgHasFeature(access.organizationId, 'api'))) throw new ApiKeyError('feature');
  const key = `fkt_${randomBytes(32).toString('base64url')}`;
  const scopes = [...new Set(form.scopes)];
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Organization" WHERE "id" = ${access.organizationId} FOR NO KEY UPDATE`;
    const active = await tx.apiKey.count({
      where: { organizationId: access.organizationId, revokedAt: null },
    });
    if (active >= MAX_ACTIVE_KEYS) throw new ApiKeyError('limit');
    const created = await tx.apiKey.create({
      data: {
        organizationId: access.organizationId,
        name: form.name,
        prefix: key.slice(0, 12),
        keyHash: hashApiKey(key),
        scopes,
        createdById: actorId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'api.key.created',
      targetType: 'ApiKey',
      targetId: created.id,
      details: { scopes },
    });
    return { id: created.id, key };
  });
}

export async function revokeApiKey(access: OrgAccess, actorId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.apiKey.updateMany({
      where: { id, organizationId: access.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new ApiKeyError('notFound');
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'api.key.revoked',
      targetType: 'ApiKey',
      targetId: id,
    });
  });
}

export interface ApiPrincipal {
  keyId: string;
  organizationId: string;
  scopes: ApiScope[];
  createdById: string | null;
  /** Планът вече няма `api` — ключът е валиден, но не работи (403, не 401). */
  planAllows: boolean;
}

/** `Authorization: Bearer fkt_…` → ключът; непознат, оттеглен или повреден → null. */
export async function authenticateApiKey(header: string | undefined): Promise<ApiPrincipal | null> {
  const match = /^Bearer\s+(\S+)$/.exec(header ?? '');
  const key = match?.[1];
  if (!key || !KEY_PATTERN.test(key)) return null;
  const found = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: { id: true, organizationId: true, scopes: true, createdById: true, revokedAt: true },
  });
  if (!found || found.revokedAt) return null;
  // „Последно ползван“ — най-много веднъж на минута (без запис на всяка заявка).
  await prisma.apiKey.updateMany({
    where: {
      id: found.id,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 60_000) } }],
    },
    data: { lastUsedAt: new Date() },
  });
  return {
    keyId: found.id,
    organizationId: found.organizationId,
    scopes: found.scopes.filter((s): s is ApiScope =>
      (API_SCOPES as readonly string[]).includes(s),
    ),
    createdById: found.createdById,
    planAllows: await orgHasFeature(found.organizationId, 'api'),
  };
}
