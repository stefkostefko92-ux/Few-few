import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sharedStore } from '../auth/rate-limit.js';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { tenantByEmail } from '../db/discovery.js';
import { withTenantIfKnown } from '../db/tenant-context.js';
import { capabilitiesFor } from '../auth/rbac.js';
import { apiError, requireCsrf, requireSameOrigin, requireSession } from '../auth/guards.js';
import {
  dummyHash,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  mfaStateOf,
  revokeSession,
  setSessionCookie,
  type Principal,
} from '../auth/sessions.js';
import { passwordRefused } from '../services/sso/policy.js';
import { resetPasswordWithToken } from '../services/users.js';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** Токенът от линка `/reset#…` (base64url) и новата парола. */
const ResetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});

function publicUser(p: Principal['user']) {
  return { id: p.id, name: p.name, role: p.role, kind: p.kind, locale: p.locale };
}

export function authRouter(deps: AppDeps): Router {
  const router = Router();
  const sessionDeps = deps.sessions;

  // Опитите за вход: по IP — срещу пробване на пароли от един адрес (§15.1 rate limiting).
  const loginLimiter = rateLimit({
    store: sharedStore('auth-login'),
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => apiError(res, 429, 'too_many_attempts'),
  });
  // Нулирането е публично: токенът е 256 бита, лимитът пази Argon2 (64 MiB на опит) от претоварване.
  const resetLimiter = rateLimit({
    store: sharedStore('auth-reset'),
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
        // Клиентът по имейла — тесният път преди вход; непознат имейл → без контекст (нула редове).
        const tenantId = await tenantByEmail(deps.db, email);
        await withTenantIfKnown(tenantId, () => passwordLogin(email, password, res));
      } catch (err) {
        next(err);
      }
    },
  );

  async function passwordLogin(email: string, password: string, res: Response): Promise<void> {
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
    // Единният вход е задължителен за човека (REQUIRED) — паролата е вярна, но не стига. Казва
    // се само на знаещия паролата (иначе отговорът е invalid_credentials като по-горе).
    if (await passwordRefused(deps.db, user)) {
      await appendAudit(deps.db, {
        tenantId: user.tenantId,
        actorId: user.id,
        action: 'auth.login_failed',
        detail: { method: 'password', reason: 'sso_required' },
      });
      return apiError(res, 403, 'sso_required');
    }
    // Сесията започва без втори фактор: включен TOTP → /auth/mfa/verify; персонал без TOTP →
    // /auth/mfa/setup. Дотогава сесията стига само до /auth/me, /auth/logout и /auth/mfa/*.
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
      mfa: mfaStateOf(user, false),
    });
  }

  router.get('/me', requireSession, (req, res) => {
    const p = req.principal as Principal;
    res.json({
      user: publicUser(p.user),
      csrfToken: p.session.csrfToken,
      mfa: p.mfa,
      capabilities: capabilitiesFor(p.user.role),
      authMethod: p.session.authMethod === 'SSO' ? 'sso' : 'password',
    });
  });

  router.post('/logout', requireSession, requireCsrf(deps.publicOrigin), async (req, res, next) => {
    try {
      const p = req.principal as Principal;
      await revokeSession(deps.db, p);
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

  // FR-25: нова парола по еднократния линк от администратора. Публично (човекът не е вписан);
  // всяка грешка на токена е един и същ отговор — не издава дали линкът е съществувал.
  router.post(
    '/reset-password',
    resetLimiter,
    requireSameOrigin(deps.publicOrigin),
    async (req, res, next) => {
      try {
        const parsed = ResetSchema.safeParse(req.body);
        if (!parsed.success) return apiError(res, 400, 'invalid_input');
        if (parsed.data.newPassword.length < PASSWORD_MIN_LENGTH) {
          return apiError(res, 422, 'weak_password');
        }
        const ok = await resetPasswordWithToken(
          deps.db,
          sessionDeps.pepper,
          parsed.data.token,
          parsed.data.newPassword,
        );
        if (!ok) return apiError(res, 400, 'invalid_token');
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
