import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { MAX } from '../preventivi/form.js';
import { ALIQUOTE } from '../preventivi/importi.js';
import {
  eliminaVoce,
  getVoce,
  parseVoce,
  salvaVoce,
  tuttoIlListino,
  valoriVoce,
  type ErroriVoce,
} from '../preventivi/listino.js';
import {
  aziendaScelta,
  gestioneListino,
  mostraListino,
  provenienzaDi,
  puoScrivere,
  tornaA,
  type Provenienza,
} from './listino-vista.js';
import { notFound } from './schede-shared.js';

/**
 * Ценоразписът на фирмата (C1): `/preventivi/listino` — търсене, страници, нов ред; `/:id` — промяна;
 * изтриване. Вижда го, който вижда офертите във фирмата; пише — който ги пише. С много фирми — изборът
 * горе (`?azienda=`). `/preventivi/listino.json` — редовете и условията по подразбиране за формата на
 * офертата (подсказките; при смяна на фирмата) и къде се управлява ценоразписът. Същото съдържание е и
 * раздел „Listino prezzi“ на настройките (listino-vista.ts): `da=impostazioni` връща там. Внасянето наведнъж
 * и износът — preventivi-listino-import.ts.
 */
export const preventiviListinoRouter: Router = Router();

const read = requireCapability('preventivi:read');
const write = requireCapability('preventivi:write');

preventiviListinoRouter.get('/preventivi/listino', read, (req, res) =>
  mostraListino(req, res, 200, { aziendaId: req.query.azienda, da: 'preventivi' }),
);

preventiviListinoRouter.get('/preventivi/listino.json', write, async (req, res) => {
  const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const { azienda } = await aziendaScelta(req, aziendaId);
  if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId))
    return notFound(req, res);
  const [voci, row, gestione] = await Promise.all([
    tuttoIlListino(aziendaId),
    prisma.azienda.findUnique({ where: { id: aziendaId }, select: { preventivoCondizioni: true } }),
    gestioneListino(req, aziendaId),
  ]);
  res.set('Cache-Control', 'no-store').json({
    condizioni: row?.preventivoCondizioni ?? '',
    gestione,
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
  const da = await provenienzaDi(req, body.da, aziendaId);
  const parsed = parseVoce(body);
  if (!parsed.ok)
    return mostraListino(req, res, 422, {
      aziendaId,
      da,
      values: valoriDalBody(body),
      errors: parsed.errors,
    });
  const esito = await salvaVoce(principalOf(req).user.id, aziendaId, null, parsed.data);
  if (esito === 'missing') return notFound(req, res);
  if (esito !== 'ok') {
    const errors: ErroriVoce =
      esito === 'duplicato' ? { codice: 'duplicato' } : { descrizione: 'range' };
    return mostraListino(req, res, 422, { aziendaId, da, values: valoriDalBody(body), errors });
  }
  setFlash(res, 'ok', 'preventivi.listino.flash.aggiunta');
  res.redirect(303, tornaA(da, aziendaId));
});

/** Редът в обхвата за писане — по фирмата от адреса; и откъде е дошъл човекът (`?da=`). */
async function voceDa(req: Request) {
  const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const { azienda } = await aziendaScelta(req, aziendaId);
  if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId)) return null;
  const voce = await getVoce(aziendaId, String(req.params.id));
  if (!voce) return null;
  return { azienda, voce, da: await provenienzaDi(req, req.query.da, aziendaId) };
}

const renderVoce = (
  res: Response,
  status: number,
  view: {
    azienda: { id: string; name: string };
    id: string;
    da: Provenienza;
    values: Record<string, string>;
    errors: ErroriVoce;
  },
) =>
  res.status(status).render('preventivi/voce', {
    titleKey: 'preventivi.listino.modifica',
    max: MAX,
    aliquote: ALIQUOTE,
    back: tornaA(view.da, view.azienda.id),
    ...view,
  });

preventiviListinoRouter.get('/preventivi/listino/:id', write, async (req, res) => {
  const found = await voceDa(req);
  if (!found) return notFound(req, res);
  renderVoce(res, 200, {
    azienda: found.azienda,
    id: found.voce.id,
    da: found.da,
    values: valoriVoce(found.voce),
    errors: {},
  });
});

preventiviListinoRouter.post('/preventivi/listino/:id', write, requireCsrf, async (req, res) => {
  const found = await voceDa(req);
  if (!found) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const view = {
    azienda: found.azienda,
    id: found.voce.id,
    da: found.da,
    values: valoriDalBody(body),
  };
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
  res.redirect(303, tornaA(found.da, found.azienda.id));
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
    res.redirect(303, tornaA(found.da, found.azienda.id));
  },
);
