import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { signSession } from './jwt.js';
import { requireAuth, SESSION_COOKIE } from './middleware.js';
import { verifyPassword } from './password.js';

export const authRouter = Router();

/** Анти-brute-force: ограничава опитите за вход по IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много опити за вход. Опитай по-късно.' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN,
    maxAge: env.JWT_TTL_HOURS * 60 * 60 * 1000,
    path: '/',
  });
}

authRouter.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Невалиден имейл или парола.' });
    return;
  }
  const { email, password } = parsed.data;
  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  // Еднакъв отговор при липсващ потребител и грешна парола — без user enumeration.
  const ok = admin && admin.active && (await verifyPassword(admin.passHash, password));
  if (!admin || !ok) {
    logger.warn({ email }, 'failed admin login');
    res.status(401).json({ error: 'Грешен имейл или парола.' });
    return;
  }

  const token = await signSession({ sub: admin.id, email: admin.email, role: admin.role });
  setSessionCookie(res, token);
  res.json({ id: admin.id, email: admin.email, role: admin.role });
});

authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(SESSION_COOKIE, {
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json(req.admin);
});
