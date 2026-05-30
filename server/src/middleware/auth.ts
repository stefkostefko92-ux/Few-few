import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';

export interface AuthPayload {
  uid: number;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload as object, secret, { expiresIn });
}

// Throttle IP/UA writes so we update at most once per user per 60s.
const lastSeenTracked = new Map<number, number>();

function trackIp(uid: number, req: Request): void {
  const now = Date.now();
  const last = lastSeenTracked.get(uid) || 0;
  if (now - last < 60_000) return;
  lastSeenTracked.set(uid, now);
  const ip = (req.ip || '').replace('::ffff:', '') || (req.headers['x-forwarded-for'] as string) || '';
  const country = (req as any).detectedCountry || '';
  const ua = ((req.headers['user-agent'] as string) || '').slice(0, 200);
  try {
    getDb()
      .prepare('UPDATE users SET last_ip = ?, last_country = ?, last_user_agent = ?, last_seen_at = ? WHERE id = ?')
      .run(ip, country, ua, now, uid);
  } catch {
    /* ignore — table may not exist mid-migration */
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const decoded = jwt.verify(token, secret) as AuthPayload;
    req.auth = decoded;
    trackIp(decoded.uid, req);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
