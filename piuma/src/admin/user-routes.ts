import { Router } from 'express';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { humanPrincipal, requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { hashPassword, passwordPolicyError } from '../auth/password.js';
import { ALL_ROLES, ROLE_LABEL, assignableRoles, outranks } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { actorOf, setFlash, stringField, tr } from './helpers.js';

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'REVIEWER', 'EDITOR', 'ANALYST', 'VIEWER']);

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  role: roleSchema,
});

export const userRouter: Router = Router();
userRouter.use('/admin/users', requireLogin, requireCapability('users:manage'));

userRouter.get('/admin/users', async (req, res) => {
  const me = humanPrincipal(req)!;
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      totpEnabledAt: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });
  res.render('admin/users', {
    title: tr(res, 'users.title'),
    users,
    roles: assignableRoles(me.user.role),
    allRoles: ALL_ROLES,
    roleLabel: ROLE_LABEL,
    canManage: (target: Role) => outranks(me.user.role, target),
    errors: [],
  });
});

userRouter.post('/admin/users', requireCsrf, async (req, res) => {
  const me = humanPrincipal(req)!;
  const input = userSchema.safeParse({
    email: stringField(req.body, 'email').toLowerCase(),
    name: stringField(req.body, 'name'),
    role: stringField(req.body, 'role'),
  });
  const password = String((req.body as Record<string, unknown>)?.password ?? '');
  const policyError = passwordPolicyError(password);
  if (!input.success || policyError) {
    setFlash(res, 'error', policyError ?? tr(res, 'flash.invalidUser'));
    res.redirect('/admin/users');
    return;
  }
  if (!outranks(me.user.role, input.data.role)) {
    setFlash(res, 'error', tr(res, 'flash.roleTooHigh'));
    res.redirect('/admin/users');
    return;
  }
  const exists = await prisma.user.findUnique({ where: { email: input.data.email } });
  if (exists) {
    setFlash(res, 'error', tr(res, 'flash.emailTaken'));
    res.redirect('/admin/users');
    return;
  }
  const user = await prisma.user.create({
    data: { ...input.data, passwordHash: await hashPassword(password) },
  });
  await audit(actorOf(req), {
    action: 'user.create',
    targetType: 'User',
    targetId: user.id,
    detail: { email: user.email, role: user.role },
  });
  setFlash(res, 'ok', tr(res, 'flash.userCreated', { email: user.email }));
  res.redirect('/admin/users');
});

async function loadTarget(
  req: Parameters<Router['post']>[1] extends infer _
    ? Parameters<Parameters<Router['post']>[1]>[0]
    : never,
) {
  const me = humanPrincipal(req)!;
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) return { me, target: null, error: 'flash.noUser' };
  if (target.id === me.user.id) return { me, target, error: 'flash.selfManaged' };
  if (!outranks(me.user.role, target.role)) return { me, target, error: 'flash.noRightOverUser' };
  return { me, target, error: null };
}

userRouter.post('/admin/users/:id/role', requireCsrf, async (req, res) => {
  const { me, target, error } = await loadTarget(req);
  const role = roleSchema.safeParse(stringField(req.body, 'role'));
  if (error || !target || !role.success || !outranks(me.user.role, role.data)) {
    setFlash(res, 'error', error ? tr(res, error) : tr(res, 'flash.invalidRole'));
    res.redirect('/admin/users');
    return;
  }
  await prisma.user.update({ where: { id: target.id }, data: { role: role.data } });
  await destroyAllSessions(target.id);
  await audit(actorOf(req), {
    action: 'user.role',
    targetType: 'User',
    targetId: target.id,
    detail: { from: target.role, to: role.data },
  });
  setFlash(
    res,
    'ok',
    tr(res, 'flash.roleChanged', {
      email: target.email,
      role: tr(res, `role.${role.data}`),
    }),
  );
  res.redirect('/admin/users');
});

userRouter.post('/admin/users/:id/toggle', requireCsrf, async (req, res) => {
  const { target, error } = await loadTarget(req);
  if (error || !target) {
    setFlash(res, 'error', error ? tr(res, error) : tr(res, 'flash.genericError'));
    res.redirect('/admin/users');
    return;
  }
  const active = !target.active;
  await prisma.user.update({
    where: { id: target.id },
    data: { active, failedLogins: 0, lockedUntil: null },
  });
  if (!active) await destroyAllSessions(target.id);
  await audit(actorOf(req), {
    action: active ? 'user.enable' : 'user.disable',
    targetType: 'User',
    targetId: target.id,
  });
  setFlash(
    res,
    'ok',
    tr(res, 'flash.userToggled', {
      email: target.email,
      state: tr(res, active ? 'flash.stateActive' : 'flash.stateSuspended'),
    }),
  );
  res.redirect('/admin/users');
});

userRouter.post('/admin/users/:id/reset-2fa', requireCsrf, async (req, res) => {
  const { target, error } = await loadTarget(req);
  if (error || !target) {
    setFlash(res, 'error', error ? tr(res, error) : tr(res, 'flash.genericError'));
    res.redirect('/admin/users');
    return;
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { totpSecretEnc: null, totpEnabledAt: null },
  });
  await destroyAllSessions(target.id);
  await audit(actorOf(req), { action: 'user.totp.reset', targetType: 'User', targetId: target.id });
  setFlash(
    res,
    'ok',
    `Вторият фактор на ${target.email} е нулиран; ще го включи отново при следващ вход.`,
  );
  res.redirect('/admin/users');
});

userRouter.post('/admin/users/:id/reset-password', requireCsrf, async (req, res) => {
  const { target, error } = await loadTarget(req);
  const password = String((req.body as Record<string, unknown>)?.password ?? '');
  const policyError = passwordPolicyError(password);
  if (error || !target || policyError) {
    setFlash(res, 'error', error ? tr(res, error) : (policyError ?? tr(res, 'flash.genericError')));
    res.redirect('/admin/users');
    return;
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null },
  });
  await destroyAllSessions(target.id);
  await audit(actorOf(req), {
    action: 'user.password.reset',
    targetType: 'User',
    targetId: target.id,
  });
  setFlash(res, 'ok', tr(res, 'flash.userPassword', { email: target.email }));
  res.redirect('/admin/users');
});
