import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import {
  CAPACITA_CONFIGURABILI,
  nomiSalvati,
  permessiSalvati,
  predefiniti,
  RUOLI_AZIENDA,
  RUOLI_CONFIGURABILI,
} from '../auth/permessi.js';
import { CAMPI_DATI, datiSalvati, type DatiSocietari } from '../aziende/dati.js';
import { aziendeImpostabili, setOrdineSezioni } from '../aziende/sezioni.js';
import { altezzaAnteprima, LARGHEZZA_ANTEPRIMA } from '../cartelli/anteprima.js';
import { MODELLI, MODELLI_ID, modelloDi } from '../cartelli/modelli.js';
import { setFlash } from '../http/flash.js';
import type { SectionKey } from '../schede/fields.js';
import {
  FISSE,
  ordineEffettivo,
  parseMossa,
  parseOrdine,
  sposta,
  type Verso,
} from '../schede/ordine.js';

/**
 * Настройките на фирмата: данните ѝ и шаблонът на табелата „Avviso di fermo impianto“
 * (impostazioni-cartello.ts), имената и правата на ролите (impostazioni-ruoli.ts) и редът на разделите
 * на картата. Администраторът на фирмата (и MASTER) мести
 * разделите нагоре и надолу без JavaScript: всеки бутон праща целия ред, страницата се връща с новия ред
 * незаписан, „Salva“ го записва (един запис в одита). Фирма извън обхвата — 404.
 */
export const impostazioniRouter: Router = Router();
const settings = requireCapability('aziende:settings');

export type AziendaImpostabile = Awaited<ReturnType<typeof aziendeImpostabili>>[number];

/** Ролите във формата: записаните имена (празно — по подразбиране) и правата на всяка роля под ADMIN. */
function ruoliForm(azienda: AziendaImpostabile): Record<string, string | string[]> {
  const nomi = nomiSalvati(azienda.nomiRuoli);
  const permessi = permessiSalvati(azienda.permessiRuoli);
  return Object.fromEntries([
    ...RUOLI_AZIENDA.map((role) => [`nome-${role}`, nomi[role] ?? '']),
    ...RUOLI_CONFIGURABILI.map((role) => [
      `perm-${role}`,
      [...(permessi[role] ?? predefiniti(role))],
    ]),
  ]);
}

/** Данните във формата: записаните, или празни, докато не са записани. */
function datiForm(azienda: AziendaImpostabile): Record<keyof DatiSocietari, string> {
  const salvati = datiSalvati(azienda.datiSocietari);
  return Object.fromEntries(CAMPI_DATI.map((key) => [key, salvati?.[key] ?? ''])) as Record<
    keyof DatiSocietari,
    string
  >;
}

export function renderImpostazioni(
  res: Response,
  status: number,
  view: {
    aziende: AziendaImpostabile[];
    azienda: AziendaImpostabile;
    ordine?: SectionKey[];
    modificato?: boolean;
    focus?: { key: SectionKey; verso: Verso } | null;
    error?: string | null;
    dati?: { values: Record<string, string>; errors: Partial<Record<string, string>> };
    ruoli?: { values: Record<string, string | string[]>; errors: Partial<Record<string, string>> };
  },
): void {
  const { azienda } = view;
  res.status(status).render('impostazioni/index', {
    ordine: ordineEffettivo(azienda.ordineSezioni),
    modificato: false,
    focus: null,
    error: null,
    fisse: FISSE,
    dati: { values: datiForm(azienda), errors: {} },
    campiDati: CAMPI_DATI,
    modelli: MODELLI_ID.map((id) => {
      const modello = MODELLI.get(id)!;
      return {
        id,
        titolo: modello.titolo,
        width: LARGHEZZA_ANTEPRIMA,
        height: altezzaAnteprima(modello),
      };
    }),
    modello: modelloDi(azienda.cartelloModello).id,
    ruoli: { values: ruoliForm(azienda), errors: {} },
    ruoliAzienda: RUOLI_AZIENDA,
    ruoliConfigurabili: RUOLI_CONFIGURABILI,
    capacita: CAPACITA_CONFIGURABILI,
    ...view,
  });
}

export function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

impostazioniRouter.get('/impostazioni', settings, async (req, res) => {
  const aziende = await aziendeImpostabili(principalOf(req).user);
  const wanted = typeof req.query.azienda === 'string' ? req.query.azienda : null;
  const azienda = wanted ? aziende.find((a) => a.id === wanted) : aziende[0];
  if (!azienda) return notFound(req, res);
  renderImpostazioni(res, 200, { aziende, azienda });
});

impostazioniRouter.post('/impostazioni/sezioni', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const back = `/impostazioni?azienda=${encodeURIComponent(azienda.id)}`;
  if (body.ripristina === '1') {
    await setOrdineSezioni(user, azienda.id, null);
    setFlash(res, 'ok', 'flash.sezioniReset');
    return res.redirect(303, back);
  }
  const ordine = parseOrdine(body.ordine);
  if (!ordine) {
    return renderImpostazioni(res, 400, { aziende, azienda, error: 'impostazioni.error' });
  }
  const mossa = parseMossa(body.sposta);
  if (mossa) {
    return renderImpostazioni(res, 200, {
      aziende,
      azienda,
      ordine: sposta(ordine, mossa.key, mossa.verso),
      modificato: true,
      focus: mossa,
    });
  }
  if (body.salva !== '1') {
    return renderImpostazioni(res, 400, { aziende, azienda, error: 'impostazioni.error' });
  }
  await setOrdineSezioni(user, azienda.id, ordine);
  setFlash(res, 'ok', 'flash.sezioniSaved');
  res.redirect(303, back);
});
