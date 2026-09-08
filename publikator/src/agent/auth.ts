import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { decryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import type { NonceStore } from './nonce-store.js';
import {
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  SIGNATURE_MAX_SKEW_SECONDS,
  timestampWithinSkew,
  verifySignature,
} from './signature.js';

export const AGENT_SCOPES = [
  'brands:read',
  'accounts:read',
  'drafts:read',
  'drafts:write',
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

/**
 * Машинна автентикация: ключ-ид + timestamp + nonce + HMAC подпис върху метод/път/тяло.
 * Отказ при: непознат/отменен/изтекъл ключ, чужд IP, дрейф над 5 мин, повторен nonce, лош подпис.
 * Nonce складът е задължителен — недостъпен склад = отказ (fail-closed).
 */
export function agentAuth(nonceStore: NonceStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const keyId = req.get(HEADER_KEY_ID) ?? '';
    const timestamp = req.get(HEADER_TIMESTAMP) ?? '';
    const nonce = req.get(HEADER_NONCE) ?? '';
    const signature = req.get(HEADER_SIGNATURE) ?? '';

    const reject = (status: number, reason: string): void => {
      logger.warn({ keyId: keyId || null, ip: req.ip, reason }, 'отказана агентска заявка');
      res.status(status).json({ error: reason });
    };

    if (!keyId || !timestamp || !nonce || !signature) {
      reject(401, 'Липсват заглавия за подпис.');
      return;
    }
    if (!timestampWithinSkew(timestamp)) {
      reject(401, 'Времевият печат е извън допустимия прозорец.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) {
      reject(401, 'Невалиден nonce.');
      return;
    }

    const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
      reject(401, 'Непознат, отменен или изтекъл ключ.');
      return;
    }
    if (key.allowedIps.length > 0 && !key.allowedIps.includes(req.ip ?? '')) {
      reject(403, 'Адресът не е разрешен за този ключ.');
      return;
    }

    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    const valid = verifySignature(
      decryptSecret(key.secretEnc, config().TOKEN_ENC_KEY),
      {
        timestamp,
        nonce,
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.path,
        body: rawBody,
      },
      signature,
    );
    if (!valid) {
      reject(401, 'Невалиден подпис.');
      return;
    }

    let fresh: boolean;
    try {
      fresh = await nonceStore.claim(key.id, nonce, SIGNATURE_MAX_SKEW_SECONDS * 2);
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : 'неизвестна' },
        'nonce складът е недостъпен',
      );
      res.status(503).json({ error: 'Проверката за повторение е недостъпна.' });
      return;
    }
    if (!fresh) {
      reject(401, 'Повторена заявка.');
      return;
    }

    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date(), lastUsedIp: req.ip ?? null },
    });

    req.principal = {
      kind: 'agent',
      key: { id: key.id, name: key.name, scopes: key.scopes, brandIds: key.brandIds },
    };
    next();
  };
}

export function requireScope(scope: AgentScope) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'agent' || !principal.key.scopes.includes(scope)) {
      res.status(403).json({ error: `Ключът няма обхват ${scope}.` });
      return;
    }
    next();
  };
}
