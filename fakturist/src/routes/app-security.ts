import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { MINUTE } from '../time.js';
import { ID_PATTERN } from '../ids.js';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { BRAND } from '../brand.js';
import { HttpError } from '../auth/guards.js';
import { decryptTotpDraft, encryptTotpDraft, encryptTotpSecret } from '../auth/keys.js';
import { generateTotpSecret, otpauthUrl, readableSecret, verifyTotp } from '../auth/totp.js';
import {
  hashPassword,
  passwordProblem,
  verifyPassword,
  PASSWORD_MAX_LENGTH,
} from '../auth/password.js';

const OWNERSHIP_PATH = new RegExp(`^/app/o/(${ID_PATTERN})/sobstvenost(?:/|$)`);

/**
 * Проверките на текущата парола (смяна, двуфакторен вход, закриване, предаване на собственост): до 10 за
 * 15 минути на профил — ЕДИН брояч за всички страници (Разбивача, 16.11.2026: отделните тавани се събират).
 * Без таван откраднатата сесия отгатва паролата, а всяка проверка е Argon2id (64 MiB) — и товар за входа на
 * всички (Кодаджията, 16.11.2026).
 */
export const passwordCheckLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
  handler: (req, res) => {
    const ownership = OWNERSHIP_PATH.exec(req.originalUrl);
    res.redirect(
      303,
      ownership
        ? `/app/o/${ownership[1]}/sobstvenost?err=rateLimited`
        : '/app/sigurnost?err=rateLimited',
    );
  },
});

/** Сигурността на профила: смяна на паролата и двуфакторен вход. Пазачът requireUser е в appRouter. */
export function appSecurityRouter(): Router {
  const router = Router();

  // --- Сигурност: смяна на паролата и двуфакторен вход ----------------------------------------------
  router.get('/app/sigurnost', async (req, res) => {
    const user = req.principal!.user;
    const secret = generateTotpSecret();
    const url = otpauthUrl(BRAND.nameLatin, user.email, secret);
    res.render('app/security', {
      draft: encryptTotpDraft(secret, user.id),
      readable: readableSecret(secret),
      qr: user.totpEnabled
        ? null
        : await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 }),
      ok: typeof req.query['ok'] === 'string' ? req.query['ok'] : null,
      err: typeof req.query['err'] === 'string' ? req.query['err'] : null,
    });
  });

  router.post('/app/sigurnost/parola', passwordCheckLimiter, async (req, res) => {
    const principal = req.principal!;
    const body = z
      .object({
        current: z.string().max(PASSWORD_MAX_LENGTH),
        next: z.string().max(PASSWORD_MAX_LENGTH),
      })
      .safeParse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: principal.user.id } });
    const problem = body.success
      ? passwordProblem(body.data.next, [user.email, user.name])
      : 'tooShort';
    if (!body.success || !(await verifyPassword(body.data.current, user.passwordHash)) || problem) {
      return res.redirect(303, `/app/sigurnost?err=${problem ?? 'current'}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.data.next), mustChangePassword: false },
      });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: principal.sessionId } } });
      await audit(tx, {
        actorId: user.id,
        action: 'auth.password.changed',
        targetType: 'User',
        targetId: user.id,
      });
    });
    res.redirect(303, '/app/sigurnost?ok=password');
  });

  router.post('/app/sigurnost/2fa', passwordCheckLimiter, async (req, res) => {
    const principal = req.principal!;
    const body = z
      .object({
        draft: z.string().max(400),
        code: z.string().max(20),
        password: z.string().max(PASSWORD_MAX_LENGTH),
      })
      .safeParse(req.body);
    // Включената 2FA не се презаписва оттук: смяната е отделен поток с текущия код и паролата.
    if (principal.user.totpEnabled) throw new HttpError(409);
    if (!body.success) return res.redirect(303, '/app/sigurnost?err=code');
    // Текущата парола: откраднатата сесия не може да включи свой втори фактор и да заключи собственика.
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: principal.user.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(body.data.password, owner.passwordHash))) {
      return res.redirect(303, '/app/sigurnost?err=current');
    }
    // Черновата е вързана с този акаунт (AAD = userId) — чужда чернова не се дешифрира.
    const secret = decryptTotpDraft(body.data.draft, principal.user.id);
    if (!secret) return res.redirect(303, '/app/sigurnost?err=code');
    const step = verifyTotp(secret, body.data.code, null);
    if (step === null) return res.redirect(303, '/app/sigurnost?err=code');
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: principal.user.id, totpEnabledAt: null },
        data: {
          totpSecretEnc: encryptTotpSecret(secret, principal.user.id),
          totpEnabledAt: new Date(),
          totpLastStep: step,
        },
      });
      if (updated.count !== 1) throw new HttpError(409);
      await audit(tx, {
        actorId: principal.user.id,
        action: 'auth.2fa.enabled',
        targetType: 'User',
        targetId: principal.user.id,
      });
    });
    res.redirect(303, '/app/sigurnost?ok=2fa');
  });

  return router;
}
