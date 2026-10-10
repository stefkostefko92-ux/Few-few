import type { PrismaClient } from '@prisma/client';

/**
 * Доказателство за основния фактор при настройка на TOTP. Паролата пази от открадната сесия без
 * втори фактор, която сама си „включва“ MFA. Човек от единен вход може да няма парола — за него
 * доказателството е СВЕЖ вход при доставчика: сесията е създадена от SSO преди ≤ 10 минути (току-що
 * мина входа при доставчика). По-стара SSO сесия → изход и нов вход (`sso_reauth_required`).
 * Сесия с парола не минава оттук — за нея паролата остава задължителна.
 */

export const SSO_FRESH_MS = 10 * 60 * 1000;

export type SsoProof = 'fresh' | 'stale' | 'not_sso';

export async function ssoProofOf(
  db: PrismaClient,
  sessionId: string,
  now = Date.now(),
): Promise<SsoProof> {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    select: { authMethod: true, createdAt: true, revokedAt: true },
  });
  if (!s || s.revokedAt !== null || s.authMethod !== 'SSO') return 'not_sso';
  return now - s.createdAt.getTime() <= SSO_FRESH_MS ? 'fresh' : 'stale';
}
