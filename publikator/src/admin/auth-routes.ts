import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { humanPrincipal, requireCsrf, requireLogin } from '../auth/guards.js';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password.js';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  markMfaPassed,
  sessionCookieName,
  sessionCookieOptions,
} from '../auth/sessions.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../auth/totp.js';
import { actorOf, setFlash, stringField } from './helpers.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const totpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const authRouter: Router = Router();

authRouter.get('/admin/login', (req, res) => {
  if (humanPrincipal(req)) {
    res.redirect('/admin');
    return;
  }
  res.render('admin/login', {
    title: 'Вход',
    error: null,
    next: typeof req.query.next === 'string' ? req.query.next : '',
  });
});

authRouter.post('/admin/login', loginLimiter, async (req, res) => {
  const input = loginSchema.safeParse({
    email: stringField(req.body, 'email').toLowerCase(),
    password: (req.body as Record<string, unknown>)?.password,
  });
  const fail = (message: string): void => {
    res.status(401).render('admin/login', { title: 'Вход', error: message, next: '' });
  };
  if (!input.success) {
    fail('Невалидни данни за вход.');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: input.data.email } });
  if (!user || !user.active) {
    // Същото време на отговор като при грешна парола — не издаваме кой съществува.
    await verifyPassword(
      input.data.password,
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    fail('Грешен имейл или парола.');
    return;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    fail(
      `Акаунтът е заключен до ${user.lockedUntil.toLocaleTimeString('bg-BG')} след няколко грешни опита.`,
    );
    return;
  }

  const ok = await verifyPassword(input.data.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit(
      { type: 'HUMAN', id: user.id, label: user.email, ip: req.ip },
      { action: 'auth.login.failed', detail: { failed } },
    );
    fail('Грешен имейл или парола.');
    return;
  }

  const mfaPassed = !user.totpEnabledAt;
  const session = await createSession(user.id, req, { mfaPassed });
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  res.cookie(sessionCookieName(), session.token, sessionCookieOptions(session.maxAge));
  await audit(
    { type: 'HUMAN', id: user.id, label: `${user.name} <${user.email}>`, ip: req.ip },
    {
      action: mfaPassed ? 'auth.login' : 'auth.login.password',
      detail: { mfaRequired: !mfaPassed },
    },
  );

  const next = stringField(req.body, 'next');
  const safeNext = next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  res.redirect(mfaPassed ? safeNext : '/admin/2fa');
});

authRouter.post('/admin/logout', async (req, res) => {
  const principal = humanPrincipal(req);
  if (principal) {
    await destroySession(principal.sessionToken);
    await audit(actorOf(req), { action: 'auth.logout' });
  }
  res.clearCookie(sessionCookieName(), sessionCookieOptions(0));
  res.redirect('/admin/login');
});

/* ---------- Втори фактор при вход ---------- */

authRouter.get('/admin/2fa', (req, res) => {
  const principal = humanPrincipal(req);
  if (!principal) {
    res.redirect('/admin/login');
    return;
  }
  if (!principal.user.totpEnabledAt || principal.session.mfaPassed) {
    res.redirect('/admin');
    return;
  }
  res.render('admin/2fa', { title: 'Втори фактор', error: null });
});

authRouter.post('/admin/2fa', totpLimiter, async (req, res) => {
  const principal = humanPrincipal(req);
  if (!principal) {
    res.redirect('/admin/login');
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
  if (!user.totpSecretEnc) {
    res.redirect('/admin');
    return;
  }
  const secret = decryptSecret(user.totpSecretEnc, config().TOKEN_ENC_KEY);
  if (!verifyTotp(secret, stringField(req.body, 'code'))) {
    await audit(actorOf(req), { action: 'auth.totp.failed' });
    res
      .status(401)
      .render('admin/2fa', { title: 'Втори фактор', error: 'Грешен код. Опитай отново.' });
    return;
  }
  await markMfaPassed(principal.session.id);
  await audit(actorOf(req), { action: 'auth.login' });
  res.redirect('/admin');
});

/* ---------- Профил: включване на TOTP, смяна на парола ---------- */

authRouter.get('/admin/profile', requireLogin, async (req, res) => {
  const principal = humanPrincipal(req)!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
  res.render('admin/profile', { title: 'Профил', user, setup: null });
});

authRouter.post('/admin/profile/2fa/start', requireLogin, requireCsrf, async (req, res) => {
  const principal = humanPrincipal(req)!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
  if (user.totpEnabledAt) {
    setFlash(res, 'info', 'Вторият фактор вече е включен.');
    res.redirect('/admin/profile');
    return;
  }
  const secret = generateTotpSecret();
  // Тайната се пази криптирана, но НЕ е активна, докато кодът не бъде потвърден.
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptSecret(secret, config().TOKEN_ENC_KEY), totpEnabledAt: null },
  });
  const url = otpauthUrl(config().TOTP_ISSUER, user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  res.render('admin/profile', { title: 'Профил', user, setup: { secret, qrDataUrl } });
});

authRouter.post(
  '/admin/profile/2fa/confirm',
  requireLogin,
  requireCsrf,
  totpLimiter,
  async (req, res) => {
    const principal = humanPrincipal(req)!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
    if (!user.totpSecretEnc || user.totpEnabledAt) {
      res.redirect('/admin/profile');
      return;
    }
    const secret = decryptSecret(user.totpSecretEnc, config().TOKEN_ENC_KEY);
    if (!verifyTotp(secret, stringField(req.body, 'code'))) {
      setFlash(res, 'error', 'Кодът не съвпада — сканирай отново и въведи текущия код.');
      res.redirect('/admin/profile');
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
    await markMfaPassed(principal.session.id);
    await audit(actorOf(req), { action: 'auth.totp.enabled' });
    setFlash(res, 'ok', 'Вторият фактор е включен. Отсега нататък входът иска код.');
    res.redirect('/admin/profile');
  },
);

authRouter.post('/admin/profile/2fa/disable', requireLogin, requireCsrf, async (req, res) => {
  const principal = humanPrincipal(req)!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
  const password = String((req.body as Record<string, unknown>)?.password ?? '');
  if (!(await verifyPassword(password, user.passwordHash))) {
    setFlash(res, 'error', 'Грешна парола — вторият фактор остава включен.');
    res.redirect('/admin/profile');
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: null, totpEnabledAt: null },
  });
  await audit(actorOf(req), { action: 'auth.totp.disabled' });
  setFlash(res, 'ok', 'Вторият фактор е изключен.');
  res.redirect('/admin/profile');
});

authRouter.post('/admin/profile/password', requireLogin, requireCsrf, async (req, res) => {
  const principal = humanPrincipal(req)!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
  const body = req.body as Record<string, unknown>;
  const current = String(body?.current ?? '');
  const next = String(body?.next ?? '');
  if (!(await verifyPassword(current, user.passwordHash))) {
    setFlash(res, 'error', 'Текущата парола е грешна.');
    res.redirect('/admin/profile');
    return;
  }
  const policyError = passwordPolicyError(next);
  if (policyError) {
    setFlash(res, 'error', policyError);
    res.redirect('/admin/profile');
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  // Всички други сесии падат — само текущата остава.
  await destroyAllSessions(user.id);
  const session = await createSession(user.id, req, { mfaPassed: true });
  res.cookie(sessionCookieName(), session.token, sessionCookieOptions(session.maxAge));
  await audit(actorOf(req), { action: 'auth.password.changed' });
  setFlash(res, 'ok', 'Паролата е сменена; другите сесии са прекратени.');
  res.redirect('/admin/profile');
});
