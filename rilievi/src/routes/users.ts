import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { emailSchema } from '../auth/email.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { assignableRoles, isRole } from '../auth/roles.js';
import { scopeOf } from '../auth/scope.js';
import { activeAziende, allAziendeNames, isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { ADMIN_RESET_HOURS } from '../services/auth.js';
import { createInvite, pendingInvites, revokeInvite, INVITE_DAYS } from '../services/invites.js';
import {
  canManage,
  changeAzienda,
  changeRole,
  createResetLink,
  getUser,
  listUsers,
  setActive,
} from '../services/users.js';

/**
 * Хората на портала. Кани и управлява само най-високата роля във фирмата (ADMIN — в своята фирма) и
 * собственикът на портала (MASTER — във всяка фирма, избира я при поканата).
 */
export const usersRouter: Router = Router();
const manage = requireCapability('users:manage');

/** Филтърът по фирма — само за MASTER. */
function aziendaFilterOf(req: Request): string | null {
  const value = req.query.azienda;
  return scopeOf(principalOf(req).user).all && isAziendaId(value) ? value : null;
}

usersRouter.get('/utenti', manage, async (req, res) => {
  const actor = principalOf(req).user;
  const all = scopeOf(actor).all;
  const filter = aziendaFilterOf(req);
  const [users, invites, aziende] = await Promise.all([
    listUsers(actor, filter),
    pendingInvites(actor, filter),
    all ? allAziendeNames() : Promise.resolve([]),
  ]);
  res.render('users/index', {
    users: users.map((user) => ({ ...user, manageable: canManage(actor, user) })),
    invites: invites.map((invite) => ({
      ...invite,
      revocable: assignableRoles(actor.role).includes(invite.role),
    })),
    showAzienda: all,
    aziende,
    aziendaFilter: filter ?? '',
  });
});

interface InviteForm {
  email: string;
  name: string;
  role: string;
  azienda: string;
}

async function renderInviteForm(
  req: Request,
  res: Response,
  status: number,
  form: InviteForm,
  error: string | null,
): Promise<void> {
  const actor = principalOf(req).user;
  res.status(status).render('users/invite', {
    form,
    error,
    roles: assignableRoles(actor.role),
    days: INVITE_DAYS,
    // MASTER избира фирмата; администраторът кани в своята (показва се само името ѝ).
    aziende: scopeOf(actor).all ? await activeAziende() : [],
    ownAzienda: actor.aziendaName,
  });
}

usersRouter.get('/utenti/invita', manage, async (req, res) => {
  const roles = assignableRoles(principalOf(req).user.role);
  await renderInviteForm(
    req,
    res,
    200,
    {
      email: '',
      name: '',
      role: roles.includes('TECNICO') ? 'TECNICO' : (roles[0] ?? ''),
      azienda: typeof req.query.azienda === 'string' ? req.query.azienda : '',
    },
    null,
  );
});

const inviteSchema = z.object({
  email: emailSchema,
  name: z
    .string()
    .transform((value) => value.replace(/\p{Cc}/gu, ' ').trim())
    .pipe(z.string().min(2).max(120)),
  role: z.string().refine(isRole),
});

/** Първото поле с грешка → ключът на съобщението. */
const INVITE_FIELD_ERROR: Record<string, string> = {
  email: 'users.error.email',
  name: 'users.error.name',
  role: 'users.error.role',
};

usersRouter.post('/utenti/invita', manage, requireCsrf, async (req, res) => {
  const actor = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const form: InviteForm = {
    email: typeof body.email === 'string' ? body.email.slice(0, 254) : '',
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : '',
    role: typeof body.role === 'string' ? body.role : '',
    azienda: typeof body.azienda === 'string' ? body.azienda.slice(0, 40) : '',
  };
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? 'email');
    await renderInviteForm(req, res, 400, form, INVITE_FIELD_ERROR[field] ?? 'users.error.email');
    return;
  }
  const { email, name, role } = parsed.data;
  if (!isRole(role)) {
    await renderInviteForm(req, res, 400, form, 'users.error.role');
    return;
  }
  const result = await createInvite(actor, { email, name, role, aziendaId: body.azienda });
  if (!result.ok) {
    const status = { userExists: 409, roleNotAllowed: 403, azienda: 400 }[result.error];
    await renderInviteForm(req, res, status, form, `users.error.${result.error}`);
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
  const user = await getUser(actor, String(req.params.id));
  if (!user) {
    res.status(404).render('errors/error', {
      status: 404,
      titleKey: 'error.notFoundTitle',
      messageKey: 'error.notFound',
    });
    return;
  }
  const all = scopeOf(actor).all;
  res.render('users/show', {
    target: user,
    manageable: canManage(actor, user),
    roles: assignableRoles(actor.role),
    resetHours: ADMIN_RESET_HOURS,
    // Само MASTER мести хора между фирмите.
    aziende: all && user.role !== 'MASTER' ? await activeAziende() : [],
  });
});

usersRouter.post('/utenti/:id/ruolo', manage, requireCsrf, async (req, res) => {
  const role = (req.body as Record<string, unknown>).role;
  const ok = isRole(role) && (await changeRole(principalOf(req).user, String(req.params.id), role));
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.roleChanged' : 'flash.notAllowed');
  res.redirect(`/utenti/${encodeURIComponent(String(req.params.id))}`);
});

usersRouter.post('/utenti/:id/azienda', manage, requireCsrf, async (req, res) => {
  const ok = await changeAzienda(
    principalOf(req).user,
    String(req.params.id),
    (req.body as Record<string, unknown>).azienda,
  );
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.aziendaChanged' : 'flash.notAllowed');
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
  const actor = principalOf(req).user;
  const user = await getUser(actor, String(req.params.id));
  const result = user ? await createResetLink(actor, user.id) : null;
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
