import { AdminRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import { prisma } from '../prisma.js';
import { verifySession } from './jwt.js';

export const SESSION_COOKIE = 'pomagam_session';

export type AuthedAdmin = {
  id: string;
  email: string;
  role: AdminRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

/** Йерархия на ролите — по-висок ранг включва правата на по-ниските. */
const RANK: Record<AdminRole, number> = {
  [AdminRole.VIEWER]: 1,
  [AdminRole.MODERATOR]: 2,
  [AdminRole.ADMIN]: 3,
};

/**
 * Изисква валидна сесия. Чете JWT от httpOnly бисквитка, проверява го и зарежда
 * админа от базата, за да отрази деактивиране веднага (а не чак при изтичане).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Изисква се вписване.' });
    return;
  }
  const claims = await verifySession(token);
  if (!claims) {
    res.status(401).json({ error: 'Сесията е невалидна или изтекла.' });
    return;
  }
  const admin = await prisma.adminUser.findUnique({ where: { id: claims.sub } });
  if (!admin || !admin.active) {
    res.status(401).json({ error: 'Достъпът е прекратен.' });
    return;
  }
  req.admin = { id: admin.id, email: admin.email, role: admin.role };
  next();
}

/** Изисква поне дадената роля. Прилага се след `requireAuth`. */
export function requireRole(min: AdminRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin || RANK[req.admin.role] < RANK[min]) {
      res.status(403).json({ error: 'Недостатъчни права.' });
      return;
    }
    next();
  };
}
