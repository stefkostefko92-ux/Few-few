import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, requireCsrf, requireSameOrigin, requireUser } from '../auth/guards.js';
import { dummyHash, PASSWORD_MAX_LENGTH, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  revokeSession,
  setSessionCookie,
  type Principal,
} from '../auth/sessions.js';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

function publicUser(p: Principal['user']) {
  return { id: p.id, name: p.name, role: p.role, kind: p.kind, locale: p.locale };
}

export function authRouter(deps: AppDeps): Router {
  const router = Router();
  const sessionDeps = deps.sessions;

  // Опитите за вход: по IP — срещу пробване на пароли от един адрес (§15.1 rate limiting).
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => apiError(res, 429, 'too_many_attempts'),
  });

  router.post(
    '/login',
    loginLimiter,
    requireSameOrigin(deps.publicOrigin),
    async (req, res, next) => {
      try {
        const parsed = LoginSchema.safeParse(req.body);
        if (!parsed.success) return apiError(res, 400, 'invalid_input');
        const { email, password } = parsed.data;
        const user = await deps.db.user.findUnique({ where: { email } });
        // Същото време с или без акаунт — отговорът не издава кой имейл съществува.
        const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
        const now = new Date();
        const usable =
          user !== null && ok && user.active && (user.expiresAt === null || user.expiresAt > now);
        if (!usable) {
          if (user) {
            await appendAudit(deps.db, {
              tenantId: user.tenantId,
              actorId: user.id,
              action: 'auth.login_failed',
            });
          }
          return apiError(res, 401, 'invalid_credentials');
        }
        const session = await createSession(sessionDeps, user.id);
        await deps.db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
        await appendAudit(deps.db, {
          tenantId: user.tenantId,
          actorId: user.id,
          action: 'auth.login',
        });
        setSessionCookie(res, sessionDeps, session.token, session.expiresAt);
        res.json({
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            kind: user.kind,
            locale: user.locale,
          },
          csrfToken: session.csrfToken,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/me', requireUser, (req, res) => {
    const p = req.principal as Principal;
    res.json({ user: publicUser(p.user), csrfToken: p.session.csrfToken });
  });

  router.post('/logout', requireUser, requireCsrf(deps.publicOrigin), async (req, res, next) => {
    try {
      const p = req.principal as Principal;
      await revokeSession(deps.db, p.session.id);
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'auth.logout',
      });
      clearSessionCookie(res, sessionDeps);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
