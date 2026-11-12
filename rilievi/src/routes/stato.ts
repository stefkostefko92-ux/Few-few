import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { inputRoma } from '../master/tempo.js';
import { STATO_PATH } from '../seo/paths.js';
import {
  elencoAvvisi,
  MAX_TESTO,
  MAX_TITOLO,
  parseAvviso,
  salvaAvviso,
  TIPI,
} from '../stato/avvisi.js';
import {
  avvisiPubblici,
  classifica,
  componenti,
  GIORNI_STORICO,
  RPO_ORE,
  RTO_ORE,
  statoGenerale,
} from '../stato/servizio.js';
import { setFlash } from '../http/flash.js';
import { notFound } from './schede-shared.js';
import { siteLocals } from './site.js';

/**
 * `/stato` — публична (условията 2026-11-12, чл. 2.4): частите на услугата сега, прекъсванията в ход,
 * планираната поддръжка, историята от 90 дни и целите за възстановяване; `noindex` (страница за момента, не за
 * търсачките), но достъпна за всеки. `/master/stato` — съобщенията на страницата, само MASTER.
 */
export const statoRouter: Router = Router();

statoRouter.get(STATO_PATH, async (req, res) => {
  const now = new Date();
  const [parti, avvisi] = await Promise.all([componenti(now), avvisiPubblici(now)]);
  const c = classifica(avvisi, now);
  res.set('Cache-Control', 'no-store').render('site/stato', {
    ...siteLocals(req, STATO_PATH),
    noindex: true,
    generale: statoGenerale(parti, c.inCorso),
    parti,
    ...c,
    controllatoIl: now,
    rpoOre: RPO_ORE,
    rtoOre: RTO_ORE,
    giorniStorico: GIORNI_STORICO,
  });
});

const manage = requireCapability('aziende:manage');

function renderMaster(
  res: Response,
  status: number,
  view: { id: string | null; values: Record<string, string>; errors: Record<string, string> },
  avvisi: Awaited<ReturnType<typeof elencoAvvisi>>,
) {
  res.status(status).render('master/stato', {
    titleKey: 'stato.master.titolo',
    avvisi,
    tipi: TIPI,
    maxTitolo: MAX_TITOLO,
    maxTesto: MAX_TESTO,
    inputRoma,
    ...view,
  });
}

const vuoto = { tipo: 'INTERRUZIONE', titolo: '', testo: '', inizio: '', fine: '' };
const valoriDalBody = (body: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(vuoto).map((k) => [
      k,
      typeof body[k] === 'string' ? (body[k] as string).slice(0, 2200) : '',
    ]),
  );

statoRouter.get('/master/stato', manage, async (_req, res) => {
  renderMaster(
    res,
    200,
    { id: null, values: { ...vuoto, inizio: inputRoma(new Date()) }, errors: {} },
    await elencoAvvisi(),
  );
});

statoRouter.get('/master/stato/:id', manage, async (req, res) => {
  const avvisi = await elencoAvvisi();
  const a = avvisi.find((x) => x.id === req.params.id);
  if (!a) return notFound(req, res);
  renderMaster(
    res,
    200,
    {
      id: a.id,
      values: {
        tipo: a.tipo,
        titolo: a.titolo,
        testo: a.testo,
        inizio: inputRoma(a.inizio),
        fine: a.fine ? inputRoma(a.fine) : '',
      },
      errors: {},
    },
    avvisi,
  );
});

async function salva(id: string | null, req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const parsed = parseAvviso(body);
  if (!parsed.ok)
    return renderMaster(
      res,
      422,
      { id, values: valoriDalBody(body), errors: parsed.errors },
      await elencoAvvisi(),
    );
  if (!(await salvaAvviso(principalOf(req).user.id, id, parsed.data))) return notFound(req, res);
  setFlash(res, 'ok', 'stato.master.salvato');
  res.redirect(303, '/master/stato');
}

statoRouter.post('/master/stato', manage, requireCsrf, (req, res) => salva(null, req, res));
statoRouter.post('/master/stato/:id', manage, requireCsrf, (req, res) =>
  salva(String(req.params.id), req, res),
);
