import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { emailSchema } from '../auth/email.js';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { assignableRoles, isRole } from '../auth/roles.js';
import { activeAziende, isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import {
  acceptAccessRequest,
  type AcceptError,
  deleteAccessRequest,
  getAccessRequest,
  isRequestFilter,
  listAccessRequests,
  rejectAccessRequest,
  REQUEST_FILTERS,
  REQUEST_RETENTION_DAYS,
} from '../requests/service.js';
import { INVITE_DAYS } from '../services/invites.js';

/**
 * Заявките за достъп — само за MASTER (`requests:manage`). „Да“ = нова фирма (или съществуваща) +
 * обикновената покана до администратора ѝ; „не“ = отказ без писмо; изтриване по всяко време.
 */
export const requestsRouter: Router = Router();
const manage = requireCapability('requests:manage');

function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

requestsRouter.get('/richieste', manage, async (req, res) => {
  const filter = isRequestFilter(req.query.stato) ? req.query.stato : 'NEW';
  const asked = Number(req.query.p);
  const page = Number.isInteger(asked) && asked > 0 && asked < 10_000 ? asked : 1;
  res.render('requests/index', {
    list: await listAccessRequests(filter, page),
    filter,
    filters: REQUEST_FILTERS,
  });
});

interface AcceptForm {
  mode: 'new' | 'existing';
  aziendaName: string;
  azienda: string;
  email: string;
  name: string;
  role: string;
}

async function renderShow(
  req: Request,
  res: Response,
  status: number,
  form: AcceptForm | null,
  error: string | null,
): Promise<void> {
  const request = await getAccessRequest(String(req.params.id));
  if (!request) return notFound(req, res);
  const roles = assignableRoles(principalOf(req).user.role);
  res.status(status).render('requests/show', {
    request,
    form: form ?? {
      mode: 'new',
      aziendaName: request.company,
      azienda: '',
      email: request.email,
      name: request.name,
      role: roles.includes('ADMIN') ? 'ADMIN' : (roles[0] ?? ''),
    },
    error,
    roles,
    aziende: request.status === 'NEW' ? await activeAziende() : [],
    retentionDays: REQUEST_RETENTION_DAYS,
    inviteDays: INVITE_DAYS,
  });
}

requestsRouter.get('/richieste/:id', manage, async (req, res) => {
  await renderShow(req, res, 200, null, null);
});

const nameSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(2).max(120));

const ACCEPT_STATUS: Record<Exclude<AcceptError, 'notFound'>, number> = {
  decided: 409,
  userExists: 409,
  nameTaken: 409,
  azienda: 400,
  roleNotAllowed: 403,
};

const text = (body: Record<string, unknown>, key: string, max: number): string => {
  const value = body[key];
  return typeof value === 'string' ? value.slice(0, max) : '';
};

requestsRouter.post('/richieste/:id/accetta', manage, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const form: AcceptForm = {
    mode: body.mode === 'existing' ? 'existing' : 'new',
    aziendaName: text(body, 'aziendaName', 120),
    azienda: text(body, 'azienda', 40),
    email: text(body, 'email', 254),
    name: text(body, 'name', 120),
    role: text(body, 'role', 20),
  };
  const fail = (status: number, error: string) => renderShow(req, res, status, form, error);
  const email = emailSchema.safeParse(form.email);
  if (!email.success) return fail(400, 'requests.error.email');
  const name = nameSchema.safeParse(form.name);
  if (!name.success) return fail(400, 'requests.error.name');
  if (!isRole(form.role)) return fail(400, 'requests.error.roleNotAllowed');
  let aziendaId: string | null = null;
  let aziendaName = '';
  if (form.mode === 'existing') {
    if (!isAziendaId(form.azienda)) return fail(400, 'requests.error.azienda');
    aziendaId = form.azienda;
  } else {
    const parsed = nameSchema.safeParse(form.aziendaName);
    if (!parsed.success) return fail(400, 'requests.error.aziendaName');
    aziendaName = parsed.data;
  }
  const result = await acceptAccessRequest(principalOf(req).user, String(req.params.id), {
    aziendaId,
    aziendaName,
    email: email.data,
    name: name.data,
    role: form.role,
  });
  if (!result.ok) {
    if (result.error === 'notFound') return notFound(req, res);
    return fail(ACCEPT_STATUS[result.error], `requests.error.${result.error}`);
  }
  // Връзката се показва ВЕДНЪЖ (в базата е само хешът) — същата страница като при обикновена покана.
  res.set('Cache-Control', 'no-store');
  res.render('users/link', {
    kind: 'invite',
    link: result.link,
    mail: result.mail,
    email: result.email,
    days: INVITE_DAYS,
    hideSwitches: true,
  });
});

requestsRouter.post('/richieste/:id/rifiuta', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const ok = await rejectAccessRequest(principalOf(req).user, id);
  setFlash(res, ok ? 'ok' : 'error', ok ? 'flash.requestRejected' : 'flash.requestDecided');
  res.redirect(303, `/richieste/${encodeURIComponent(id)}`);
});

requestsRouter.post('/richieste/:id/elimina', manage, requireCsrf, async (req, res) => {
  const ok = await deleteAccessRequest(principalOf(req).user, String(req.params.id));
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.requestDeleted');
  res.redirect(303, '/richieste');
});
