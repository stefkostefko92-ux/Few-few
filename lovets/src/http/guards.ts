import type { NextFunction, Request, Response } from 'express';
import type { OwnerStore } from '../auth/owner-store.js';
import { SESSION_COOKIE, verifySession, type SessionClaims } from '../auth/session.js';

/** CSRF: всяка заявка, която променя нещо, идва от нашия Origin (плюс SameSite=Strict). */
export function sameOrigin(appOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.get('origin') === appOrigin) return next();
    res.status(403).json({ error: 'Заявката не идва от приложението.' });
  };
}

/** Валидна сесия: подписът е верен, собственикът съществува и версията на сесиите съвпада. */
export async function currentSession(
  req: Request,
  jwtSecret: string,
  owners: OwnerStore,
): Promise<SessionClaims | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') return null;
  const claims = await verifySession(token, jwtSecret);
  if (!claims) return null;
  const owner = await owners.findById(claims.ownerId);
  return owner && owner.sessionVersion === claims.version ? claims : null;
}

export function requireOwner(jwtSecret: string, owners: OwnerStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = await currentSession(req, jwtSecret, owners);
    if (!session) {
      res.status(401).json({ error: 'Нужен е вход.' });
      return;
    }
    res.locals.ownerId = session.ownerId;
    next();
  };
}
