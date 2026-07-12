import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';
import { clientIp, clientHwid, requestBanStatus } from '../lib/bans';

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

/** Resolve the JWT secret. In production we refuse to boot with a missing
 *  or default secret — that was the #3 finding in the security audit:
 *  anyone with the public default could forge admin tokens. */
function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'dev-secret-change-me' || s === 'replace-me-with-a-long-random-string') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is unset or set to a known placeholder; refusing to start in production');
    }
    // In dev, warn loudly but allow boot.
    if (!process.env.__JWT_WARNED) {
      // eslint-disable-next-line no-console
      console.warn('[auth] JWT_SECRET missing — falling back to dev secret. DO NOT ship to production.');
      process.env.__JWT_WARNED = '1';
    }
    return 'dev-secret-change-me';
  }
  if (s.length < 24) throw new Error('JWT_SECRET must be at least 24 characters');
  return s;
}

export function signToken(payload: AuthPayload, tokenVersion = 0): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ ...payload, tv: tokenVersion } as object, jwtSecret(), { expiresIn });
}

// Throttle IP/UA writes so we update at most once per user per 60s.
const lastSeenTracked = new Map<number, number>();

function trackIp(uid: number, req: Request): void {
  const now = Date.now();
  const last = lastSeenTracked.get(uid) || 0;
  if (now - last < 60_000) return;
  lastSeenTracked.set(uid, now);
  const ip = clientIp(req);
  const country = (req as any).detectedCountry || '';
  const ua = ((req.headers['user-agent'] as string) || '').slice(0, 200);
  const hwid = clientHwid(req);
  try {
    getDb()
      .prepare('UPDATE users SET last_ip = ?, last_country = ?, last_user_agent = ?, last_hwid = ?, last_seen_at = ? WHERE id = ?')
      .run(ip, country, ua, hwid, now, uid);
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
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as AuthPayload & { tv?: number };
    // Token-version check — bump users.token_version when password
    // changes / reset / explicit logout to invalidate all old JWTs
    // immediately. Audit finding #6.
    try {
      const row = getDb()
        .prepare('SELECT token_version, banned, banned_reason, banned_until FROM users WHERE id = ?')
        .get(decoded.uid) as { token_version?: number; banned?: number; banned_reason?: string; banned_until?: number } | undefined;
      // A missing row means the user was deleted (a successful query just
      // returns undefined) — reject rather than defaulting token_version to
      // 0, which let a deleted user's still-valid JWT keep authenticating
      // (also defeats GDPR erasure).
      if (!row) {
        res.status(401).json({ error: 'Session expired' });
        return;
      }
      // Банат потребител → 403 (изтеклите временни банове НЕ важат).
      const until = row.banned_until ?? 0;
      if (row.banned === 1 && (until === 0 || until > Date.now())) {
        res.status(403).json({ error: 'banned', reason: row.banned_reason || 'Account banned.', until });
        return;
      }
      if ((decoded.tv ?? 0) !== (row.token_version ?? 0)) {
        res.status(401).json({ error: 'Session expired' });
        return;
      }
    } catch { /* column may not exist mid-migration */ }
    // Бан по IP/устройство — хваща и ДРУГИ акаунти от банато ip/hwid
    // (спира ban-евейжън чрез нов акаунт от същата машина/мрежа).
    try {
      const ban = requestBanStatus(undefined, clientIp(req), clientHwid(req));
      if (ban.banned) {
        res.status(403).json({ error: 'banned', reason: ban.reason || 'Access from this device or network is banned.', until: ban.until ?? 0 });
        return;
      }
    } catch { /* ban tables may not exist mid-migration */ }
    req.auth = decoded;
    trackIp(decoded.uid, req);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
