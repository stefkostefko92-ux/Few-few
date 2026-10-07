import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';
import { principalOf } from '../auth/guards.js';
import { setFlash } from '../http/flash.js';

/** Пълният ред на вписания човек — свеж от базата, не от кеша на сесията. */
export async function me(req: Request): Promise<User> {
  return prisma.user.findUniqueOrThrow({ where: { id: principalOf(req).user.id } });
}

/** Съобщение + връщане (Post/Redirect/Get). */
export function back(
  res: Response,
  path: string,
  kind: 'ok' | 'error' | 'info',
  key: string,
): void {
  setFlash(res, kind, key);
  res.redirect(path);
}
