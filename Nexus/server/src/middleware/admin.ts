import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';

export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.auth.uid) as { is_admin: number } | undefined;
  if (!user || user.is_admin !== 1) {
    res.status(403).json({ error: 'Administrator access required' });
    return;
  }
  next();
}
