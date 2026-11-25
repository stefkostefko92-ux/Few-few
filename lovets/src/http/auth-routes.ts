import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { decryptSecret } from '../auth/crypto.js';
import type { OwnerStore } from '../auth/owner-store.js';
import { dummyVerify, verifyPassword } from '../auth/password.js';
import { SESSION_COOKIE, SESSION_HOURS, signSession } from '../auth/session.js';
import { verifyTotp } from '../auth/totp.js';
import type { AppConfig } from '../config.js';
import { currentSession } from './guards.js';
import { LoginBody } from './schemas.js';

const FAIL = { error: 'Грешен имейл, парола или код.' };

export function authRoutes(
  config: AppConfig,
  owners: OwnerStore,
  nowSeconds: () => number,
): Router {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  r.post('/login', limiter, async (req, res) => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json(FAIL);
    const owner = await owners.findByEmail(body.data.email);
    if (!owner) {
      await dummyVerify(body.data.password);
      return void res.status(401).json(FAIL);
    }
    if (!(await verifyPassword(owner.passwordHash, body.data.password))) {
      return void res.status(401).json(FAIL);
    }
    const secret = decryptSecret(owner.totpSecretEnc, config.totpKey);
    const step = verifyTotp(secret, body.data.code, owner.totpLastStep, nowSeconds());
    if (step === null || !(await owners.advanceTotpStep(owner.id, step))) {
      return void res.status(401).json(FAIL);
    }
    res.cookie(
      SESSION_COOKIE,
      await signSession({ ownerId: owner.id, version: owner.sessionVersion }, config.jwtSecret),
      {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_HOURS * 3_600_000,
      },
    );
    res.json({ ok: true });
  });

  r.post('/logout', async (req, res) => {
    const session = await currentSession(req, config.jwtSecret, owners);
    if (session) await owners.bumpSessionVersion(session.ownerId);
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'strict',
      path: '/',
    });
    res.json({ ok: true });
  });

  return r;
}
