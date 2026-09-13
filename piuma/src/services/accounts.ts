import type { InstagramAccount } from '@prisma/client';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  refreshLongLivedToken,
} from '../instagram/oauth.js';
import { getPublishingQuota, type PublishingQuota } from '../instagram/publish.js';

function expiryFrom(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/**
 * Свързва вече СЪЗДАДЕН ръчно професионален Instagram акаунт към бранд.
 * Създаване на акаунти през API няма и не се прави — виж README.
 */
export async function connectAccount(brandId: string, code: string): Promise<InstagramAccount> {
  const cfg = config();
  const shortLived = await exchangeCodeForToken(cfg, code);
  const longLived = await exchangeForLongLivedToken(cfg, shortLived.access_token);
  const profile = await fetchProfile(cfg, longLived.access_token);

  const data = {
    brandId,
    username: profile.username,
    accessTokenEnc: encryptSecret(longLived.access_token, cfg.TOKEN_ENC_KEY),
    tokenExpiresAt: expiryFrom(longLived.expires_in),
    scopes: cfg.IG_SCOPES,
    status: 'ACTIVE' as const,
  };

  return prisma.instagramAccount.upsert({
    where: { igUserId: profile.id },
    create: { igUserId: profile.id, ...data },
    update: data,
  });
}

export function accountToken(account: InstagramAccount): string {
  return decryptSecret(account.accessTokenEnc, config().TOKEN_ENC_KEY);
}

/**
 * Дълготрайният токен живее 60 дни. Подновяваме всичко, което изтича до `withinDays`.
 * Изтеклият токен не се подновява — акаунтът се маркира и иска нов OAuth от човек.
 */
export async function refreshExpiringTokens(withinDays = 10): Promise<{
  refreshed: number;
  expired: number;
}> {
  const cfg = config();
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const accounts = await prisma.instagramAccount.findMany({
    where: { status: 'ACTIVE', tokenExpiresAt: { lte: horizon } },
  });

  let refreshed = 0;
  let expired = 0;

  for (const account of accounts) {
    if (account.tokenExpiresAt.getTime() <= Date.now()) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { status: 'TOKEN_EXPIRED' },
      });
      expired += 1;
      continue;
    }
    try {
      const renewed = await refreshLongLivedToken(accountToken(account));
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptSecret(renewed.access_token, cfg.TOKEN_ENC_KEY),
          tokenExpiresAt: expiryFrom(renewed.expires_in),
        },
      });
      refreshed += 1;
    } catch (error) {
      logger.error(
        { accountId: account.id, err: error instanceof Error ? error.message : 'неизвестна' },
        'подновяването на токена се провали',
      );
    }
  }

  return { refreshed, expired };
}

/** Спира акаунта и унищожава токена — нов OAuth е единственият път обратно. */
export async function disconnectAccount(accountId: string): Promise<void> {
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { status: 'DISABLED', accessTokenEnc: '', tokenExpiresAt: new Date(0) },
  });
}

/** Чете живата квота от Instagram и я кешира на акаунта за таблото. */
export async function refreshAccountQuota(accountId: string): Promise<PublishingQuota> {
  const account = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.status !== 'ACTIVE') throw new Error('Акаунтът не е активен.');
  const quota = await getPublishingQuota({
    cfg: config(),
    igUserId: account.igUserId,
    accessToken: accountToken(account),
  });
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { quotaUsed: quota.used, quotaTotal: quota.total, quotaCheckedAt: new Date() },
  });
  return quota;
}
