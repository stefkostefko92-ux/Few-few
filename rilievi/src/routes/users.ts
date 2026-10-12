import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { emailSchema } from '../auth/email.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { assignableRoles, isRole } from '../auth/roles.js';
import { setFlash } from '../http/flash.js';
import { isLocale, LOCALES } from '../i18n.js';
import { ADMIN_RESET_HOURS } from '../services/auth.js';
import { createInvite, pendingInvites, revokeInvite, INVITE_DAYS } from '../services/invites.js';
import {
  canManage,
  changeRole,
  createResetLink,
  getUser,
  listUsers,
  setActive,
} from '../services/users.js';

export const usersRouter: Router = Router();
const manage = requireCapability('users:manage');

usersRouter.get('/utenti', manage, async (req, res) => {
  const actor = principalOf(req).user;
  const [users, invites] = await Promise.all([listUsers(), pendingInvites()]);
  res.render('users/index', {
    users: users.map((user) => ({ ...user, manageable: canManage(actor, user) })),
    invites: invites.map((invite) => ({
      ...invite,
      revocable: assignableRoles(actor.role).includes(invite.role),
    })),
  });
});

interface InviteForm {
  email: string;
  name: string;
  role: string;
  locale: string;
}

function renderInviteForm(
  req: Request,
  res: Response,
  status: number,
  form: InviteForm,
  error: string | null,
): void {
  res.status(status).render('users/invite', {
    form,
    error,
    roles: assignableRoles(principalOf(req).user.role),
    locales: LOCALES,
    days: INVITE_DAYS,
  });
}

usersRouter.get('/utenti/invita', manage, (req, res) => {
  const roles = assignableRoles(principalOf(req).user.role);
  renderInviteForm(
    req,
    res,
    200,
    {
      email: '',
      name: '',
      role: roles.includes('TECNICO') ? 'TECNICO' : (roles[0] ?? ''),
      locale: res.locals.locale,
    },
    null,
  );
});

const inviteSchema = z.object({
  email: emailSchema,
  name: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === '' ? null : value)),
  role: z.string().refine(isRole),
  locale: z.string().refine(isLocale),
});

usersRouter.post('/utenti/invita', manage, requireCsrf, async (req, res) => {
  const actor = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const form: InviteForm = {
    email: typeof body.email === 'string' ? body.email.slice(0, 254) : '',
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : '',
    role: typeof body.role === 'string' ? body.role : '',
    locale: typeof body.locale === 'string' ? body.locale : res.locals.locale,
  };
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? 'email');
    renderInviteForm(req, res, 400, form, `users.error.${field === 'email' ? 'email' : 'role'}`);
    return;
  }
  const { email, name, role, locale } = parsed.data;
  if (!isRole(role) || !isLocale(locale)) {
    renderInviteForm(req, res, 400, form, 'users.error.role');
    return;
  }
  const result = await createInvite(actor, { email, name, role, locale });
  if (!result.ok) {
    renderInviteForm(
      req,
      res,
      result.error === 'userExists' ? 409 : 403,
      form,
      `users.error.${result.error}`,
    );
    return;
  }
  // Връзката се показва ВЕДНЪЖ (в базата е само хешът) — страницата не се кешира и няма превключвател.
  res.set('Cache-Control', 'no-store');
  res.render('users/link', {
    kind: 'invite',
    link: result.link,
    mail: result.mail,
    email,
    days: INVITE_DAYS,
    hideSwitches: true,
  });
});

usersRouter.post('/utenti/inviti/:id/revoca', manage, requireCsrf, async (req, res) => {
  const ok = await revokeInvite(principalOf(req).user, String(req.params.id));
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.inviteRevoked' : 'flash.notAllowed');
  res.redirect('/utenti');
});

usersRouter.get('/utenti/:id', manage, async (req, res) => {
  const actor = principalOf(req).user;
  const user = await getUser(String(req.params.id));
  if (!user) {
    res.status(404).render('errors/error', {
      status: 404,
      titleKey: 'error.notFoundTitle',
      messageKey: 'error.notFound',
    });
    return;
  }
  res.render('users/show', {
    target: user,
    manageable: canManage(actor, user),
    roles: assignableRoles(actor.role),
    resetHours: ADMIN_RESET_HOURS,
  });
});

usersRouter.post('/utenti/:id/ruolo', manage, requireCsrf, async (req, res) => {
  const role = (req.body as Record<string, unknown>).role;
  const ok = isRole(role) && (await changeRole(principalOf(req).user, String(req.params.id), role));
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.roleChanged' : 'flash.notAllowed');
  res.redirect(`/utenti/${encodeURIComponent(String(req.params.id))}`);
});

usersRouter.post('/utenti/:id/stato', manage, requireCsrf, async (req, res) => {
  const active = (req.body as Record<string, unknown>).active === '1';
  const ok = await setActive(principalOf(req).user, String(req.params.id), active);
  setFlash(
    res,
    ok ? 'ok' : 'error',
    ok ? (active ? 'flash.userReactivated' : 'flash.userDeactivated') : 'flash.notAllowed',
  );
  res.redirect(`/utenti/${encodeURIComponent(String(req.params.id))}`);
});

usersRouter.post('/utenti/:id/reimposta', manage, requireCsrf, async (req, res) => {
  const user = await getUser(String(req.params.id));
  const result = user ? await createResetLink(principalOf(req).user, user.id) : null;
  if (!user || !result) {
    setFlash(res, 'error', 'flash.notAllowed');
    res.redirect('/utenti');
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.render('users/link', {
    kind: 'reset',
    link: result.link,
    mail: result.mail,
    email: user.email,
    name: user.name,
    hours: ADMIN_RESET_HOURS,
    hideSwitches: true,
  });
});
