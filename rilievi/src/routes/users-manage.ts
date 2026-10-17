import { Router, type Request, type Response } from 'express';
import { emailSchema, personNameSchema } from '../auth/email.js';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { assignableRoles, isRole } from '../auth/roles.js';
import { roleIn } from '../auth/scope.js';
import { activeAziende, isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { ADMIN_RESET_HOURS } from '../services/auth.js';
import { addMembership, changeMembershipRole, removeMembership } from '../services/memberships.js';
import { createResetLink, getUser, setActive, updateAccount } from '../services/users.js';

/**
 * Един човек: фирмите и ролите му (тези, които гледащият вижда), акаунтът (име, имейл, парола) и
 * достъпът. Кой какво може — auth/manage.ts; тук са само формите и пренасочванията. Чужд човек — 404.
 */
export const usersManageRouter: Router = Router();
const manage = requireCapability('users:manage');

const back = (res: Response, id: string): void => res.redirect(`/utenti/${encodeURIComponent(id)}`);

async function renderUser(
  req: Request,
  res: Response,
  status: number,
  account: { name: string; email: string } | null,
  error: string | null,
): Promise<void> {
  const actor = principalOf(req).user;
  const target = await getUser(actor, String(req.params.id));
  if (!target) {
    sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    return;
  }
  const assigned = new Set(target.memberships.map((m) => m.aziendaId));
  res.status(status).render('users/show', {
    target,
    memberships: target.memberships.map((m) => ({
      ...m,
      roles: m.manageable ? assignableRoles(roleIn(actor, m.aziendaId) ?? 'CLIENTE') : [],
    })),
    account: account ?? { name: target.name, email: target.email },
    error,
    resetHours: ADMIN_RESET_HOURS,
    // Само MASTER слага човек в още фирми: активните, в които още не е (MASTER самият — в никоя).
    freeAziende:
      actor.master && !target.master
        ? (await activeAziende()).filter((azienda) => !assigned.has(azienda.id))
        : [],
    newRoles: assignableRoles('MASTER'),
  });
}

usersManageRouter.get('/utenti/:id', manage, async (req, res) => {
  await renderUser(req, res, 200, null, null);
});

/** Име и имейл — MASTER на всеки (и на себе си), администраторът на хората си. */
usersManageRouter.post('/utenti/:id/account', manage, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const typed = {
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : '',
    email: typeof body.email === 'string' ? body.email.slice(0, 254) : '',
  };
  const name = personNameSchema.safeParse(typed.name);
  if (!name.success) return renderUser(req, res, 400, typed, 'users.error.name');
  const email = emailSchema.safeParse(typed.email);
  if (!email.success) return renderUser(req, res, 400, typed, 'users.error.email');
  const id = String(req.params.id);
  const result = await updateAccount(principalOf(req).user, id, {
    name: name.data,
    email: email.data,
  });
  if (!result.ok && result.error === 'emailTaken') {
    return renderUser(req, res, 409, typed, 'users.error.emailTaken');
  }
  setFlash(res, result.ok ? 'ok' : 'error', result.ok ? 'flash.accountSaved' : 'flash.notAllowed');
  back(res, id);
});

usersManageRouter.post('/utenti/:id/stato', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const active = (req.body as Record<string, unknown>).active === '1';
  const ok = await setActive(principalOf(req).user, id, active);
  setFlash(
    res,
    ok ? 'ok' : 'error',
    ok ? (active ? 'flash.userReactivated' : 'flash.userDeactivated') : 'flash.notAllowed',
  );
  back(res, id);
});

usersManageRouter.post('/utenti/:id/reimposta', manage, requireCsrf, async (req, res) => {
  const actor = principalOf(req).user;
  const user = await getUser(actor, String(req.params.id));
  const result = user ? await createResetLink(actor, user.id) : null;
  if (!user || !result) {
    setFlash(res, 'error', 'flash.notAllowed');
    res.redirect('/utenti');
    return;
  }
  // Връзката се показва ВЕДНЪЖ (в базата е само хешът) — страницата не се кешира и няма превключвател.
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

/** Ролята в една фирма. */
usersManageRouter.post(
  '/utenti/:id/aziende/:azienda/ruolo',
  manage,
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const aziendaId = String(req.params.azienda);
    const role = (req.body as Record<string, unknown>).role;
    const ok =
      isAziendaId(aziendaId) &&
      isRole(role) &&
      (await changeMembershipRole(principalOf(req).user, id, aziendaId, role));
    setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.roleChanged' : 'flash.notAllowed');
    back(res, id);
  },
);

/** Още една фирма — само MASTER. */
usersManageRouter.post('/utenti/:id/aziende', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const body = req.body as Record<string, unknown>;
  const outcome = isRole(body.role)
    ? await addMembership(principalOf(req).user, id, body.azienda, body.role)
    : 'notAllowed';
  const flash = {
    ok: 'flash.membershipAdded',
    exists: 'flash.membershipExists',
    azienda: 'flash.membershipAzienda',
    notAllowed: 'flash.notAllowed',
  }[outcome];
  setFlash(res, outcome === 'ok' ? 'ok' : 'error', flash);
  back(res, id);
});

/** Маха човека от фирма — само MASTER; последната остава. */
usersManageRouter.post(
  '/utenti/:id/aziende/:azienda/rimuovi',
  manage,
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const aziendaId = String(req.params.azienda);
    const outcome = isAziendaId(aziendaId)
      ? await removeMembership(principalOf(req).user, id, aziendaId)
      : 'notAllowed';
    const flash = {
      ok: 'flash.membershipRemoved',
      last: 'flash.membershipLast',
      notAllowed: 'flash.notAllowed',
    }[outcome];
    setFlash(res, outcome === 'ok' ? 'ok' : 'error', flash);
    back(res, id);
  },
);
