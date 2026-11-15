import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn, scopeFor } from '../auth/scope.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { MAX } from '../preventivi/form.js';
import { ALIQUOTE, euro } from '../preventivi/importi.js';
import {
  eliminaVoce,
  getVoce,
  listListino,
  MAX_VOCI,
  parseVoce,
  salvaVoce,
  tuttoIlListino,
  valoriVoce,
  type ErroriVoce,
} from '../preventivi/listino.js';
import { pageOf } from '../schede/list.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { notFound } from './schede-shared.js';

/**
 * Ценоразписът на фирмата (C1): `/preventivi/listino` — търсене, страници, нов ред; `/:id` — промяна;
 * изтриване. Вижда го, който вижда офертите във фирмата; пише — който ги пише. С много фирми — изборът
 * горе (`?azienda=`). `/preventivi/listino.json` — редовете и условията по подразбиране за формата на
 * офертата (подсказките; при смяна на фирмата).
 */
export const preventiviListinoRouter: Router = Router();

const read = requireCapability('preventivi:read');
const write = requireCapability('preventivi:write');

/** Фирмите с видими оферти за човека (MASTER — всички активни с включени оферти). */
async function aziendeListino(req: Request) {
  const user = principalOf(req).user;
  const s = scopeFor(user, 'preventivi:read');
  if (s.all)
    return prisma.azienda.findMany({
      where: { deactivatedAt: null, preventiviAttivi: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  return user.memberships
    .filter((m) => s.aziendaIds.includes(m.aziendaId))
    .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
}

async function aziendaScelta(req: Request, raw: unknown) {
  const aziende = await aziendeListino(req);
  const azienda = aziende.find((a) => a.id === raw) ?? aziende[0] ?? null;
  return { aziende, azienda };
}

const puoScrivere = (req: Request, aziendaId: string) =>
  canIn(principalOf(req).user, 'preventivi:write', aziendaId);

async function renderListino(
  req: Request,
  res: Response,
  status: number,
  view: { aziendaId: unknown; values?: Record<string, string>; errors?: ErroriVoce },
) {
  const { aziende, azienda } = await aziendaScelta(req, view.aziendaId);
  if (!azienda) return notFound(req, res);
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const page = await listListino(azienda.id, query, pageOf(req.query.p));
  res.status(status).render('preventivi/listino', {
    titleKey: 'preventivi.listino.titolo',
    aziende,
    azienda,
    page,
    query,
    scrive: puoScrivere(req, azienda.id),
    values: view.values ?? { iva: '22' },
    errors: view.errors ?? {},
    max: MAX,
    maxVoci: MAX_VOCI,
    aliquote: ALIQUOTE,
    euro,
  });
}

preventiviListinoRouter.get('/preventivi/listino', read, (req, res) =>
  renderListino(req, res, 200, { aziendaId: req.query.azienda }),
);

preventiviListinoRouter.get('/preventivi/listino.json', write, async (req, res) => {
  const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const { azienda } = await aziendaScelta(req, aziendaId);
  if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId))
    return notFound(req, res);
  const [voci, row] = await Promise.all([
    tuttoIlListino(aziendaId),
    prisma.azienda.findUnique({ where: { id: aziendaId }, select: { preventivoCondizioni: true } }),
  ]);
  res.set('Cache-Control', 'no-store').json({
    condizioni: row?.preventivoCondizioni ?? '',
    voci: voci.map((v) => ({ ...valoriVoce(v), id: v.id })),
  });
});

const valoriDalBody = (body: Record<string, unknown>) =>
  Object.fromEntries(
    ['codice', 'descrizione', 'unita', 'prezzo', 'iva'].map((k) => [
      k,
      typeof body[k] === 'string' ? (body[k] as string).slice(0, 400) : '',
    ]),
  );

preventiviListinoRouter.post('/preventivi/listino', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const aziendaId = typeof body.azienda === 'string' ? body.azienda : '';
  const { azienda } = await aziendaScelta(req, aziendaId);
  if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId))
    return notFound(req, res);
  const parsed = parseVoce(body);
  if (!parsed.ok)
    return renderListino(req, res, 422, {
      aziendaId,
      values: valoriDalBody(body),
      errors: parsed.errors,
    });
  const esito = await salvaVoce(principalOf(req).user.id, aziendaId, null, parsed.data);
  if (esito === 'missing') return notFound(req, res);
  if (esito !== 'ok') {
    const errors: ErroriVoce =
      esito === 'duplicato' ? { codice: 'duplicato' } : { descrizione: 'range' };
    return renderListino(req, res, 422, { aziendaId, values: valoriDalBody(body), errors });
  }
  setFlash(res, 'ok', 'preventivi.listino.flash.aggiunta');
  res.redirect(303, `/preventivi/listino?azienda=${encodeURIComponent(aziendaId)}`);
});

/** Редът в обхвата за писане — по фирмата от адреса. */
async function voceDa(req: Request) {
  const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const { azienda } = await aziendaScelta(req, aziendaId);
  if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId)) return null;
  const voce = await getVoce(aziendaId, String(req.params.id));
  return voce ? { azienda, voce } : null;
}

const renderVoce = (
  res: Response,
  status: number,
  view: {
    azienda: { id: string; name: string };
    id: string;
    values: Record<string, string>;
    errors: ErroriVoce;
  },
) =>
  res.status(status).render('preventivi/voce', {
    titleKey: 'preventivi.listino.modifica',
    max: MAX,
    aliquote: ALIQUOTE,
    ...view,
  });

preventiviListinoRouter.get('/preventivi/listino/:id', write, async (req, res) => {
  const found = await voceDa(req);
  if (!found) return notFound(req, res);
  renderVoce(res, 200, {
    azienda: found.azienda,
    id: found.voce.id,
    values: valoriVoce(found.voce),
    errors: {},
  });
});

preventiviListinoRouter.post('/preventivi/listino/:id', write, requireCsrf, async (req, res) => {
  const found = await voceDa(req);
  if (!found) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const view = { azienda: found.azienda, id: found.voce.id, values: valoriDalBody(body) };
  const parsed = parseVoce(body);
  if (!parsed.ok) return renderVoce(res, 422, { ...view, errors: parsed.errors });
  const esito = await salvaVoce(
    principalOf(req).user.id,
    found.azienda.id,
    found.voce.id,
    parsed.data,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'duplicato')
    return renderVoce(res, 422, { ...view, errors: { codice: 'duplicato' } });
  setFlash(res, 'ok', 'preventivi.listino.flash.salvata');
  res.redirect(303, `/preventivi/listino?azienda=${encodeURIComponent(found.azienda.id)}`);
});

preventiviListinoRouter.post(
  '/preventivi/listino/:id/elimina',
  write,
  requireCsrf,
  async (req, res) => {
    const found = await voceDa(req);
    if (!found) return notFound(req, res);
    await eliminaVoce(principalOf(req).user.id, found.azienda.id, found.voce.id);
    setFlash(res, 'ok', 'preventivi.listino.flash.eliminata');
    res.redirect(303, `/preventivi/listino?azienda=${encodeURIComponent(found.azienda.id)}`);
  },
);
