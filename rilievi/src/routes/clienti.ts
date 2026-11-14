import { Router, type Request, type Response } from 'express';
import {
  principalOf,
  requireCapability,
  requireCapabilityPerTogliere,
  requireCsrf,
} from '../auth/guards.js';
import { canIn, canInPerTogliere, scopeFor } from '../auth/scope.js';
import {
  MAX_CLIENTE,
  numeriTelefono,
  parseCliente,
  valoriCliente,
  valoriDalBody,
  type ErroriCliente,
} from '../clienti/form.js';
import {
  clientiPerPreventivo,
  createCliente,
  eliminaCliente,
  getCliente,
  listClienti,
  MAX_CLIENTI,
  PREVENTIVI_NEL_PROFILO,
  preventiviDelCliente,
  updateCliente,
  type ClienteFull,
} from '../clienti/service.js';
import { setFlash } from '../http/flash.js';
import { euro } from '../preventivi/importi.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { aziendeInArchivio, aziendePerPreventivo } from './preventivi-vista.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';

/**
 * Клиентите на фирмата (собственикът, 13 ноември 2026 — „да регистрират клиентите си с техни профили и да
 * не трябва да ги пишат всеки път когато правят Preventivi“): `/clienti` — списък с търсене; `/clienti/nuovo`;
 * `/clienti/:id` — профилът с офертите му и „Nuovo preventivo“; промяна и изтриване. Регистърът живее с
 * офертите: чете `preventivi:read`, пише `preventivi:write` (само във фирма с включени оферти — scope.ts);
 * чужд клиент — 404. `/clienti/elenco.json` — клиентите на фирмата за формата на офертата (пишещите).
 * Клиентът от оферта към регистъра — `POST /preventivi/:id/cliente` (preventivi-azioni.ts).
 */
export const clientiRouter: Router = Router();

const read = requireCapability('preventivi:read');
const write = requireCapability('preventivi:write');
/** Изтриването на данни остава и при изтекъл абонамент (условията, чл. 12.5 в) и A.9). */
const togli = requireCapabilityPerTogliere('preventivi:write');

const loadCliente = (req: Request) =>
  getCliente(scopeFor(principalOf(req).user, 'preventivi:read'), String(req.params.id));

const puoScrivere = (req: Request, cliente: { aziendaId: string }): boolean =>
  canIn(principalOf(req).user, 'preventivi:write', cliente.aziendaId);

clientiRouter.get('/clienti', read, async (req, res) => {
  const readScope = scopeFor(principalOf(req).user, 'preventivi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const [page, aziende] = await Promise.all([
    listClienti({ scope: readScope, azienda, page: req.query.p, query }),
    aziendeOf(req, readScope),
  ]);
  res.render('clienti/list', {
    titleKey: 'clienti.list',
    page,
    aziende,
    aziendaFilter: azienda ?? '',
    query,
    numeriTelefono,
    archivio: aziendeInArchivio(req),
  });
});

interface ClienteFormView {
  cliente: ClienteFull | null;
  values: Record<string, string>;
  errors: ErroriCliente & { azienda?: 'required' | 'invalid' };
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
  /** Регистърът на фирмата е на тавана си — нов клиент не се записва. */
  pieno?: boolean;
}

function renderForm(res: Response, status: number, view: ClienteFormView): void {
  res.status(status).render('clienti/form', {
    titleKey: view.cliente ? 'clienti.modifica' : 'clienti.new',
    max: MAX_CLIENTE,
    maxClienti: MAX_CLIENTI,
    conflict: false,
    pieno: false,
    ...view,
  });
}

clientiRouter.get('/clienti/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerPreventivo(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const azienda =
    only?.id ??
    (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : '');
  renderForm(res, 200, {
    cliente: null,
    values: {},
    errors: {},
    base: '',
    aziende: choices,
    azienda,
  });
});

clientiRouter.post('/clienti', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const { choices, only } = await aziendePerPreventivo(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  const parsed = parseCliente(body);
  const again = (errors: ClienteFormView['errors'], pieno = false) =>
    renderForm(res, 422, {
      cliente: null,
      values: valoriDalBody(body),
      errors,
      base: '',
      aziende: choices,
      azienda: azienda?.id ?? '',
      pieno,
    });
  if (!azienda) return again({ azienda: 'required', ...(parsed.ok ? {} : parsed.errors) });
  if (!parsed.ok) return again(parsed.errors);
  const esito = await createCliente(principalOf(req).user.id, azienda.id, parsed.data);
  if (esito.esito === 'pieno') return again({}, true);
  // Офертите на фирмата са изключени или тя е спряна междувременно.
  if (esito.esito !== 'ok') return again({ azienda: 'invalid' });
  setFlash(res, 'ok', 'clienti.flash.creato');
  res.redirect(303, `/clienti/${esito.id}`);
});

// Пред `/clienti/:id`.
clientiRouter.get('/clienti/elenco.json', write, async (req, res) => {
  const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const { choices, only } = await aziendePerPreventivo(req);
  if (only?.id !== aziendaId && !choices.some((a) => a.id === aziendaId)) return notFound(req, res);
  const clienti = await clientiPerPreventivo(aziendaId);
  res.set('Cache-Control', 'no-store').json({
    clienti: clienti.map((c) => ({
      id: c.id,
      nome: c.nome,
      indirizzo: c.indirizzo ?? '',
      piva: c.piva ?? '',
      email: c.email ?? '',
    })),
  });
});

clientiRouter.get('/clienti/:id', read, async (req, res) => {
  const cliente = await loadCliente(req);
  if (!cliente) return notFound(req, res);
  res.render('clienti/show', {
    titleKey: 'clienti.titolo',
    cliente,
    preventivi: await preventiviDelCliente(cliente.aziendaId, cliente.id),
    mostrati: PREVENTIVI_NEL_PROFILO,
    scrive: puoScrivere(req, cliente),
    elimina: canInPerTogliere(principalOf(req).user, 'preventivi:write', cliente.aziendaId),
    euro,
    numeriTelefono,
  });
});

clientiRouter.get('/clienti/:id/modifica', write, async (req, res) => {
  const cliente = await loadCliente(req);
  if (!cliente || !puoScrivere(req, cliente)) return notFound(req, res);
  renderForm(res, 200, {
    cliente,
    values: valoriCliente(cliente),
    errors: {},
    base: cliente.updatedAt.toISOString(),
    aziende: [],
    azienda: cliente.aziendaId,
  });
});

clientiRouter.post('/clienti/:id', write, requireCsrf, async (req, res) => {
  const cliente = await loadCliente(req);
  if (!cliente || !puoScrivere(req, cliente)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseCliente(body);
  const again = (status: number, errors: ErroriCliente, conflict = false) =>
    renderForm(res, status, {
      cliente,
      values: valoriDalBody(body),
      errors,
      // При разминаване: написаното остава във формата, `base` — записаното от другия.
      base: conflict ? cliente.updatedAt.toISOString() : base,
      aziende: [],
      azienda: cliente.aziendaId,
      conflict,
    });
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updateCliente({
    id: cliente.id,
    aziendaId: cliente.aziendaId,
    base,
    data: parsed.data,
    actorId: principalOf(req).user.id,
  });
  if (esito.esito === 'missing') return notFound(req, res);
  if (esito.esito !== 'ok') return again(409, {}, true);
  setFlash(res, 'ok', 'clienti.flash.salvato');
  res.redirect(303, `/clienti/${cliente.id}`);
});

clientiRouter.post('/clienti/:id/elimina', togli, requireCsrf, async (req, res) => {
  const cliente = await loadCliente(req);
  const user = principalOf(req).user;
  if (!cliente || !canInPerTogliere(user, 'preventivi:write', cliente.aziendaId))
    return notFound(req, res);
  if (!(await eliminaCliente(user.id, cliente.aziendaId, cliente.id))) return notFound(req, res);
  setFlash(res, 'ok', 'clienti.flash.eliminato');
  res.redirect(303, '/clienti');
});
