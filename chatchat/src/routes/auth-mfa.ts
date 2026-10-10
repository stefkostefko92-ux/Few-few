import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sharedStore } from '../auth/rate-limit.js';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError, principalOf, requireCsrf, requireSession } from '../auth/guards.js';
import { checkTotp, MFA_ISSUER, type TotpReplayStore } from '../auth/mfa.js';
import { PASSWORD_MAX_LENGTH, verifyPassword } from '../auth/password.js';
import { ssoProofOf } from '../auth/sso-proof.js';
import { generateTotpSecret, otpauthUrl } from '../auth/totp.js';
import { encryptSecret } from '../crypto.js';
import { qrSvg } from '../qr.js';

/**
 * Втори фактор (TOTP, RFC 6238; §12.4, §15.1). Пътищата са достъпни със сесия БЕЗ минат втори
 * фактор — по тях човек го настройва или довършва входа. Тайната е шифрована (AES-256-GCM,
 * MFA_ENC_KEY); персоналът не може да го изключи — смяна на устройство = нулиране от администратора.
 */

const Code = z.object({ code: z.string().trim().min(1).max(12) });
/** Паролата; без нея — само свеж единен вход (`auth/sso-proof.ts`). */
const Setup = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional() });

export function authMfaRouter(deps: AppDeps, replay: TotpReplayStore): Router {
  const router = Router();
  router.use(requireSession, requireCsrf(deps.publicOrigin));

  // Лимит на опитите: 5 грешни за 15 минути на човек (броят се само неуспешните) — 10^6 кода
  // при ±1 стъпка не се изчерпват с налучкване.
  const attempts = rateLimit({
    store: sharedStore('auth-mfa'),
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_attempts'),
  });
  router.use(attempts);

  // Нова (неактивна) тайна. Иска паролата: открадната сесия без втори фактор не може сама да
  // си „включи“ MFA със свое устройство и така да стигне до данните.
  router.post('/setup', async (req, res, next) => {
    try {
      const parsed = Setup.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const user = await deps.db.user.findUniqueOrThrow({ where: { id: p.user.id } });
      if (user.totpEnabledAt) return apiError(res, 409, 'mfa_already_enabled');
      const password = parsed.data.password;
      if (password !== undefined) {
        if (!(await verifyPassword(password, user.passwordHash))) {
          return apiError(res, 400, 'invalid_password');
        }
      } else {
        // Без парола: само сесия от СВЕЖ единен вход (човек от SSO може да няма парола).
        const proof = await ssoProofOf(deps.db, p.session.id);
        if (proof === 'not_sso') return apiError(res, 400, 'invalid_input');
        if (proof === 'stale') return apiError(res, 409, 'sso_reauth_required');
      }
      const secret = generateTotpSecret();
      // Само докато не е включен: паралелно потвърждение не се подменя с нова тайна.
      const started = await deps.db.user.updateMany({
        where: { id: user.id, totpEnabledAt: null },
        data: { totpSecretEnc: encryptSecret(secret, deps.mfaKey) },
      });
      if (started.count !== 1) return apiError(res, 409, 'mfa_already_enabled');
      const otpauthUri = otpauthUrl(MFA_ISSUER, user.email, secret);
      res.json({ otpauthUri, secret, qrSvg: await qrSvg(otpauthUri) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/enable', async (req, res, next) => {
    try {
      const parsed = Code.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const user = await deps.db.user.findUniqueOrThrow({ where: { id: p.user.id } });
      if (user.totpEnabledAt) return apiError(res, 409, 'mfa_already_enabled');
      if (!user.totpSecretEnc) return apiError(res, 409, 'mfa_setup_missing');
      if (!(await checkTotp(deps.mfaKey, replay, user, parsed.data.code))) {
        return apiError(res, 400, 'invalid_code');
      }
      // Включва го само заявка с тайната, показана на човека (не подменена от второ /setup).
      const enabled = await deps.db.user.updateMany({
        where: { id: user.id, totpEnabledAt: null, totpSecretEnc: user.totpSecretEnc },
        data: { totpEnabledAt: new Date() },
      });
      if (enabled.count !== 1) return apiError(res, 409, 'mfa_already_enabled');
      // Кодът току-що е доказан — тази сесия е минала втория фактор.
      await deps.db.session.update({ where: { id: p.session.id }, data: { mfaPassed: true } });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'auth.mfa_enabled',
        objectType: 'user',
        objectId: p.user.id,
      });
      res.json({ mfa: { enabled: true, passed: true, required: p.mfa.required } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/verify', async (req, res, next) => {
    try {
      const parsed = Code.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      if (!p.mfa.enabled) return apiError(res, 409, 'mfa_not_enabled');
      if (p.mfa.passed) return res.json({ mfa: p.mfa });
      const user = await deps.db.user.findUniqueOrThrow({ where: { id: p.user.id } });
      if (!(await checkTotp(deps.mfaKey, replay, user, parsed.data.code))) {
        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'auth.mfa_failed',
        });
        return apiError(res, 400, 'invalid_code');
      }
      await deps.db.session.update({ where: { id: p.session.id }, data: { mfaPassed: true } });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'auth.mfa_verified',
      });
      res.json({ mfa: { ...p.mfa, passed: true } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/disable', async (req, res, next) => {
    try {
      const parsed = Code.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      if (p.mfa.required) return apiError(res, 403, 'mfa_required_for_role');
      if (!p.mfa.enabled) return apiError(res, 409, 'mfa_not_enabled');
      const user = await deps.db.user.findUniqueOrThrow({ where: { id: p.user.id } });
      if (!(await checkTotp(deps.mfaKey, replay, user, parsed.data.code))) {
        return apiError(res, 400, 'invalid_code');
      }
      await deps.db.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: null, totpEnabledAt: null },
      });
      replay.forget(user.id);
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'auth.mfa_disabled',
        objectType: 'user',
        objectId: p.user.id,
      });
      res.json({ mfa: { enabled: false, passed: false, required: false } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
