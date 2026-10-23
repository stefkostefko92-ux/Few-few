import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { emailSchema, personNameSchema } from '../auth/email.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { assignableRoles, isRole, outranks } from '../auth/roles.js';
import { canIn, roleIn, scopeFor, spansAziende, topRole } from '../auth/scope.js';
import { activeAziende } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { createInvite, pendingInvites, revokeInvite, INVITE_DAYS } from '../services/invites.js';
import { listUsers } from '../services/users.js';
import type { SessionUser } from '../types.js';
import { aziendaFilterOf, aziendeOf } from './schede-shared.js';

/**
 * Хората на портала: списъкът, поканите и отмяната им. Кани и управлява ADMIN — във фирмите, в които е
 * ADMIN (роли под своята) — и собственикът на портала (MASTER — във всяка фирма). Човекът и действията
 * над него — users-manage.ts.
 */
export const usersRouter: Router = Router();
const manage = requireCapability('users:manage');

usersRouter.get('/utenti', manage, async (req, res) => {
  const actor = principalOf(req).user;
  const scope = scopeFor(actor, 'users:manage');
  const filter = aziendaFilterOf(req, scope);
  const [users, invites, aziende] = await Promise.all([
    listUsers(actor, filter),
    pendingInvites(actor, filter),
    aziendeOf(req, scope),
  ]);
  res.render('users/index', {
    users,
    invites: invites.map((invite) => {
      const own = canIn(actor, 'users:manage', invite.aziendaId)
        ? roleIn(actor, invite.aziendaId)
        : null;
      return {
        ...invite,
        // Поканите от MASTER: за останалите — „Amministrazione del portale“, не името му.
        invitedByPortal: invite.invitedBy.master && !actor.master,
        revocable: own !== null && outranks(own, invite.role),
      };
    }),
    master: actor.master,
    showAzienda: spansAziende(scope),
    aziende,
    aziendaFilter: filter ?? '',
  });
});

/** Ролите, които човекът раздава: под най-високата му роля във фирмите, в които кани. */
function inviteRoles(actor: SessionUser) {
  const scope = scopeFor(actor, 'users:manage');
  const memberships = actor.memberships.filter(
    (m) => !scope.all && scope.aziendaIds.includes(m.aziendaId),
  );
  const top = topRole({ master: actor.master, memberships });
  return top ? assignableRoles(top) : [];
}

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
  const scope = scopeFor(actor, 'users:manage');
  // MASTER избира всяка активна фирма; администратор на няколко — от своите; на една — тя, без избор.
  const choices = scope.all
    ? await activeAziende()
    : actor.memberships
        .filter((m) => scope.aziendaIds.includes(m.aziendaId))
        .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
  const only = !scope.all && choices.length === 1 ? choices[0]! : null;
  res.status(status).render('users/invite', {
    form,
    error,
    roles: inviteRoles(actor),
    days: INVITE_DAYS,
    aziende: only ? [] : choices,
    ownAzienda: only?.name ?? null,
  });
}

usersRouter.get('/utenti/invita', manage, async (req, res) => {
  const roles = inviteRoles(principalOf(req).user);
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
  name: personNameSchema,
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
