import type { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sharedStore } from '../auth/rate-limit.js';
import { z } from 'zod';
import { apiError, principalOf } from '../auth/guards.js';
import type { Viewer } from '../services/collab/access.js';
import type { Result } from '../services/collab/result.js';

/** Общото за рутерите на работното пространство: идентификатори, зрител, лимити, грешки. */

export const Id = z.string().min(1).max(40);

export function viewerOf(req: Request): Viewer & { name: string } {
  const u = principalOf(req).user;
  return {
    id: u.id,
    tenantId: u.tenantId,
    companyId: u.companyId,
    role: u.role,
    kind: u.kind,
    name: u.name,
  };
}

/**
 * Лимит по потребител (техниците са зад един NAT — не по IP), §15.1. Името е ключът на брояча в
 * Redis при няколко инстанции (`auth/rate-limit.ts`) — уникално за всеки лимит.
 */
export function perUserLimit(windowMs: number, limit: number, name: string) {
  return rateLimit({
    store: sharedStore(name),
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });
}

/** Грешка от услугата → стабилен код за UI; иначе false (продължи с отговора). */
export function sendFailure<T>(
  res: Response,
  result: Result<T>,
): result is { ok: false; status: number; code: string } {
  if (result.ok) return false;
  apiError(res, result.status, result.code);
  return true;
}
