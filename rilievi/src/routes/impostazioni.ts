import { Router, type Request } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { nomiSalvati, permessiSalvati } from '../auth/permessi.js';
import { datiSalvati } from '../aziende/dati.js';
import { aziendeImpostabili, setOrdineSezioni } from '../aziende/sezioni.js';
import { modelloDi } from '../cartelli/modelli.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { ultimaAccettazione } from '../legale/accettazioni.js';
import { VERSIONE } from '../legale/versioni.js';
import { parseMossa, parseOrdine, sposta } from '../schede/ordine.js';
import {
  ICONE_SEZIONI,
  isSezione,
  notFound,
  pathSezione,
  renderImpostazioni,
  SEZIONI_IMPOSTAZIONI,
  type AziendaImpostabile,
  type SezioneImpostazioni,
} from './impostazioni-vista.js';

/**
 * Настройките на фирмата (собственикът, 10 ноември 2026 — „fai piccole directory dentro per le cose
 * separate“): `/impostazioni` — картите на разделите със състоянието им; `/impostazioni/<раздел>` —
 * данните на фирмата, редът на разделите на картата, табелата, ролите и правата, условията за услугата.
 * Пишат администраторът ѝ и MASTER (`aziende:settings`); фирма извън обхвата — 404. Записите на данните и
 * табелата са в impostazioni-cartello.ts, на ролите — в impostazioni-ruoli.ts.
 */
export const impostazioniRouter: Router = Router();
const settings = requireCapability('aziende:settings');

async function aziendaScelta(req: Request) {
  const aziende = await aziendeImpostabili(principalOf(req).user);
  const wanted = typeof req.query.azienda === 'string' ? req.query.azienda : null;
  return { aziende, azienda: wanted ? aziende.find((a) => a.id === wanted) : aziende[0] };
}

/** Състоянието на условията на фирмата и колко от хората ѝ са приели правилата. */
async function statoCondizioni(azienda: AziendaImpostabile) {
  const [accettazione, totale, regole] = await Promise.all([
    ultimaAccettazione(azienda.id),
    prisma.membership.count({ where: { aziendaId: azienda.id, user: { deactivatedAt: null } } }),
    prisma.membership.count({
      where: {
        aziendaId: azienda.id,
        user: { deactivatedAt: null, regoleVersione: VERSIONE.REGOLE },
      },
    }),
  ]);
  const vigente = azienda.condizioniVersione === VERSIONE.CONDIZIONI;
  return {
    stato: !vigente
      ? 'attesa'
      : accettazione?.versione === VERSIONE.CONDIZIONI
        ? 'firmate'
        : 'esistente',
    versione: VERSIONE.CONDIZIONI,
    accettazione: accettazione
      ? { at: accettazione.at, nome: accettazione.userNome, versione: accettazione.versione }
      : null,
    regole: { accettate: regole, totale },
  } as const;
}

/** Една дума за всяка карта на `/impostazioni` — какво е записано в раздела. */
async function riepilogo(
  azienda: AziendaImpostabile,
  t: (key: string, p?: Record<string, string | number>) => string,
  giorno: (d: Date) => string,
) {
  const dati = datiSalvati(azienda.datiSocietari);
  const ruoli =
    Object.keys(nomiSalvati(azienda.nomiRuoli)).length +
    Object.keys(permessiSalvati(azienda.permessiRuoli)).length;
  const condizioni = await statoCondizioni(azienda);
  const righe: Record<SezioneImpostazioni, string> = {
    azienda:
      t(dati?.ragioneSociale ? 'impostazioni.hub.datiSi' : 'impostazioni.hub.datiNo') +
      ' · ' +
      t(azienda.logoType ? 'impostazioni.hub.logoSi' : 'impostazioni.hub.logoNo'),
    scheda: t(
      azienda.ordineSezioni.length > 0
        ? 'impostazioni.hub.ordineSuo'
        : 'impostazioni.hub.ordineBase',
    ),
    cartelli: t('impostazioni.hub.modello', { nome: modelloDi(azienda.cartelloModello).titolo }),
    ruoli: t(ruoli > 0 ? 'impostazioni.hub.ruoliSuoi' : 'impostazioni.hub.ruoliBase'),
    condizioni:
      condizioni.stato === 'firmate' && condizioni.accettazione
        ? t('impostazioni.hub.firmate', { data: giorno(condizioni.accettazione.at) })
        : t(`impostazioni.hub.${condizioni.stato}`),
  };
  return righe;
}

impostazioniRouter.get('/impostazioni', settings, async (req, res) => {
  const { aziende, azienda } = await aziendaScelta(req);
  if (!azienda) return notFound(req, res);
  res.render('impostazioni/index', {
    aziende,
    azienda,
    sezioni: SEZIONI_IMPOSTAZIONI,
    icone: ICONE_SEZIONI,
    riepilogo: await riepilogo(azienda, res.locals.t, res.locals.fmt.day),
    pathSezione,
  });
});

impostazioniRouter.get('/impostazioni/:sezione', settings, async (req, res, next) => {
  const sezione = req.params.sezione;
  // Другите адреси под /impostazioni/ (шаблоните на табелата) са на своите рутери.
  if (!isSezione(sezione)) return next();
  const { aziende, azienda } = await aziendaScelta(req);
  if (!azienda) return notFound(req, res);
  renderImpostazioni(res, 200, {
    sezione,
    aziende,
    azienda,
    ...(sezione === 'condizioni' ? { condizioni: await statoCondizioni(azienda) } : {}),
  });
});

impostazioniRouter.post('/impostazioni/sezioni', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const back = pathSezione('scheda', azienda.id);
  const vista = { sezione: 'scheda' as const, aziende, azienda };
  if (body.ripristina === '1') {
    await setOrdineSezioni(user, azienda.id, null);
    setFlash(res, 'ok', 'flash.sezioniReset');
    return res.redirect(303, back);
  }
  const ordine = parseOrdine(body.ordine);
  if (!ordine) return renderImpostazioni(res, 400, { ...vista, error: 'impostazioni.error' });
  const mossa = parseMossa(body.sposta);
  if (mossa) {
    return renderImpostazioni(res, 200, {
      ...vista,
      ordine: sposta(ordine, mossa.key, mossa.verso),
      modificato: true,
      focus: mossa,
    });
  }
  if (body.salva !== '1')
    return renderImpostazioni(res, 400, { ...vista, error: 'impostazioni.error' });
  await setOrdineSezioni(user, azienda.id, ordine);
  setFlash(res, 'ok', 'flash.sezioniSaved');
  res.redirect(303, back);
});
