import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { principalOf, requireCsrf, requireUser } from '../auth/guards.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import { setFlash } from '../http/flash.js';
import { changePassword } from '../services/auth.js';

export const accountRouter: Router = Router();

accountRouter.get('/account', requireUser, (req, res) => {
  res.render('account/index', { error: null, name: principalOf(req).user.name });
});

const passwordSchema = z.object({
  current: z.string().max(PASSWORD_MAX_LENGTH * 4),
  password: z.string().max(PASSWORD_MAX_LENGTH * 4),
  confirm: z.string().max(PASSWORD_MAX_LENGTH * 4),
});

accountRouter.post('/account/password', requireUser, requireCsrf, async (req, res) => {
  const principal = principalOf(req);
  const fail = (error: string): void => {
    res.status(400).render('account/index', { error, name: principal.user.name });
  };
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return fail('password.problem.tooShort');
  if (parsed.data.password !== parsed.data.confirm) return fail('auth.error.confirm');
  const result = await changePassword(
    { userId: principal.user.id, sessionId: principal.session.id },
    parsed.data.current,
    parsed.data.password,
  );
  if (!result.ok) {
    return fail(
      result.error === 'wrongCurrent' || result.error === 'same'
        ? `account.error.${result.error}`
        : `password.problem.${result.error}`,
    );
  }
  setFlash(res, 'ok', 'flash.passwordChanged');
  res.redirect('/account');
});

const nameSchema = z.object({ name: z.string().trim().min(2).max(120) });

accountRouter.post('/account/profilo', requireUser, requireCsrf, async (req, res) => {
  const principal = principalOf(req);
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .render('account/index', { error: 'auth.error.name', name: principal.user.name });
    return;
  }
  await prisma.user.update({ where: { id: principal.user.id }, data: { name: parsed.data.name } });
  setFlash(res, 'ok', 'flash.profileSaved');
  res.redirect('/account');
});
