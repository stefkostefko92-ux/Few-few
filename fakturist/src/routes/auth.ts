import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { dummyHash, needsRehash, hashPassword, verifyPassword } from '../auth/password.js';
import { endSession, startSession } from '../auth/sessions.js';
import { decryptTotpSecret } from '../auth/keys.js';
import { verifyTotp } from '../auth/totp.js';
import { setting } from '../admin/settings.js';
import { register, RegistrationError, RegistrationSchema } from '../accounts/register.js';
import { MINUTE } from '../time.js';
import { requestRateKey } from '../http/ip.js';
import { attemptFailed, attemptSucceeded, NO_USER, reserveAttempt } from '../auth/lockout.js';
import { isTrustedDevice, rememberDevice } from '../auth/device.js';
import { queueLockedMail } from '../mail/account-mail.js';
import { kickOutbox } from '../mail/outbox.js';

/** Входът и регистрацията: най-много 10 опита за 15 минути от адрес. */
const limiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // IPv6 — по мрежа /64, иначе всеки адрес от мрежата на абоната има свой брояч.
  keyGenerator: requestRateKey,
});

/** Грешни кодове за втория фактор в една сесия, след които тя се трие и се иска нов вход с парола. */
export const MAX_FAILED_CODES = 5;

/** Безопасен адрес за връщане след вход: само наш относителен път (приложението, панелът, покана). */
function safeNext(value: unknown): string {
  return typeof value === 'string' && /^\/(app|admin|pokana|chlen)(\/[\w\-./?=&%]*)?$/.test(value)
    ? value
    : '/app';
}

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(256),
  next: z.string().max(300).optional(),
});

async function registrationOpen(): Promise<boolean> {
  return config().REGISTRATION_OPEN && (await setting('registration.enabled'));
}

export function authRouter(): Router {
  const router = Router();

  router.get('/vhod', (req, res) => {
    if (req.principal?.verified) return res.redirect(303, '/app');
    res.render('auth/login', {
      error: null,
      next: safeNext(req.query['next']),
      email: '',
      reset: req.query['ok'] === 'reset',
    });
  });

  router.post('/vhod', limiter, async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    const email = parsed.success ? parsed.data.email : '';
    const next = safeNext(parsed.success ? parsed.data.next : undefined);
    const user = parsed.success ? await prisma.user.findUnique({ where: { email } }) : null;
    // Опитът се заема преди проверката (SPEC 46): заключеният профил не проверява паролата си, но
    // хешът пак се смята (фиктивен) — отговорът и времето не издават кой имейл съществува и дали е заключен.
    // Довереното устройство (бисквитка от предишен вход) не спира от заключването и не го трупа;
    // блокиран профил и непознат имейл минават през същите заявки с несъществуващ id.
    const active = user && !user.disabledAt ? user : null;
    const trusted = active ? isTrustedDevice(req, active.id) : false;
    const allowed = active
      ? trusted || (await reserveAttempt(active.id))
      : (await reserveAttempt(NO_USER), false);
    const ok = await verifyPassword(
      parsed.success ? parsed.data.password : '',
      allowed && active ? active.passwordHash : await dummyHash(),
    );
    if (!active || !allowed || !ok) {
      if (active && allowed && !trusted) {
        const lockedUntil = await attemptFailed(active.id);
        if (lockedUntil) {
          await queueLockedMail(active.id, active.email, lockedUntil);
          kickOutbox();
        }
      } else {
        await attemptFailed(NO_USER);
      }
      return res.status(400).render('auth/login', { error: 'auth.invalid', next, email });
    }
    await attemptSucceeded(active.id);
    rememberDevice(res, active.id);
    if (needsRehash(active.passwordHash) && parsed.success) {
      await prisma.user.update({
        where: { id: active.id },
        data: { passwordHash: await hashPassword(parsed.data.password) },
      });
    }
    const needsCode = active.totpEnabledAt !== null;
    await startSession(res, active, !needsCode);
    if (!needsCode) {
      await prisma.user.update({ where: { id: active.id }, data: { lastLoginAt: new Date() } });
      await prisma.$transaction((tx) =>
        audit(tx, {
          actorId: active.id,
          action: 'auth.login',
          targetType: 'User',
          targetId: active.id,
        }),
      );
      return res.redirect(303, next);
    }
    res.redirect(303, `/vhod/kod?next=${encodeURIComponent(next)}`);
  });

  router.get('/vhod/kod', (req, res) => {
    if (!req.principal) return res.redirect(303, '/vhod');
    if (req.principal.verified) return res.redirect(303, '/app');
    res.render('auth/code', { error: null, next: safeNext(req.query['next']) });
  });

  router.post('/vhod/kod', limiter, async (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal) return res.redirect(303, '/vhod');
    const next = safeNext((req.body as { next?: unknown }).next);
    const code = String((req.body as { code?: unknown }).code ?? '');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
    const step = user.totpSecretEnc
      ? verifyTotp(decryptTotpSecret(user.totpSecretEnc, user.id), code, user.totpLastStep)
      : null;
    // Стъпката се записва само ако е по-нова от последната приета — едновременно подаден същият код
    // минава веднъж (условният UPDATE), и след рестарт.
    const accepted =
      step !== null &&
      (
        await prisma.user.updateMany({
          where: {
            id: user.id,
            OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
          },
          data: { totpLastStep: step },
        })
      ).count === 1;
    if (!accepted) {
      const session = await prisma.session.update({
        where: { id: principal.sessionId },
        data: { failedCodes: { increment: 1 } },
        select: { failedCodes: true },
      });
      if (session.failedCodes >= MAX_FAILED_CODES) {
        await prisma.$transaction(async (tx) => {
          await tx.session.deleteMany({ where: { id: principal.sessionId } });
          await audit(tx, {
            actorId: user.id,
            action: 'auth.2fa.locked',
            targetType: 'User',
            targetId: user.id,
          });
        });
        await endSession(req, res);
        return res.status(400).render('auth/login', { error: 'auth.codeLocked', next, email: '' });
      }
      return res.status(400).render('auth/code', { error: 'auth.badCode', next });
    }
    await prisma.session.update({ where: { id: principal.sessionId }, data: { verified: true } });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await prisma.$transaction((tx) =>
      audit(tx, {
        actorId: user.id,
        action: 'auth.login',
        targetType: 'User',
        targetId: user.id,
        details: { twoFactor: true },
      }),
    );
    res.redirect(303, next);
  });

  router.get('/registraciya', async (req, res) => {
    const kind = req.query['kind'] === 'accountant' ? 'accountant' : 'company';
    res.render('auth/register', {
      open: await registrationOpen(),
      errors: {},
      values: { kind },
    });
  });

  router.post('/registraciya', limiter, async (req: Request, res: Response) => {
    const open = await registrationOpen();
    const values = req.body as Record<string, string>;
    if (!open) return res.status(403).render('auth/register', { open, errors: {}, values });
    const parsed = RegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        errors[field] ??=
          issue.message.length < 40 && /^[a-zA-Z.]+$/.test(issue.message)
            ? issue.message
            : 'invalid';
      }
      return res
        .status(400)
        .render('auth/register', { open, errors, values: { ...values, password: '' } });
    }
    try {
      const { userId } = await register(parsed.data);
      await startSession(res, { id: userId, platformRole: 'NONE' }, true);
      res.redirect(303, '/app');
    } catch (error) {
      if (error instanceof RegistrationError) {
        const field = error.code.startsWith('password')
          ? 'password'
          : error.code === 'emailTaken'
            ? 'email'
            : 'eik';
        return res.status(400).render('auth/register', {
          open,
          errors: { [field]: error.code },
          values: { ...values, password: '' },
        });
      }
      throw error;
    }
  });

  router.post('/izhod', async (req, res) => {
    await endSession(req, res);
    res.redirect(303, '/');
  });

  return router;
}
