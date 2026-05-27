import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
