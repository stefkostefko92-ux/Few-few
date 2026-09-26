import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { logFromRequest } from '../lib/logger';

// Опитите на не-админ да достъпи /api/admin/* се логват (security), но
// най-много веднъж на минута на потребител — да не се наводни дневникът.
const lastDenied = new Map<number, number>();

/**
 * Изисква администратор. Проверява `is_admin` в БАЗАТА при всяка заявка
 * (не в JWT) — понижен админ губи достъп веднага, без да чака токена.
 * Ползвай САМО след authRequired: без req.auth → 401.
 */
export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.auth.uid) as { is_admin: number } | undefined;
  if (!user || user.is_admin !== 1) {
    const now = Date.now();
    if (now - (lastDenied.get(req.auth.uid) || 0) > 60_000) {
      lastDenied.set(req.auth.uid, now);
      if (lastDenied.size > 5000) lastDenied.clear();
      logFromRequest(req, {
        category: 'security',
        action: 'admin_denied',
        level: 'warn',
        message: `Non-admin tried ${req.method} ${req.baseUrl}${req.path}`,
      });
    }
    res.status(403).json({ error: 'Administrator access required' });
    return;
  }
  next();
}
