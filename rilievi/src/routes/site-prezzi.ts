import { Router } from 'express';
import { LIVELLI, MESI_PROVA } from '../abbonamenti/regole.js';
import { PREZZI_UPDATED } from '../company.js';
import { clienteAttivo } from '../pagamenti/config.js';
import { formatoEuro, GIORNI_FATTURA } from '../pagamenti/offerta.js';
import { pianiAttivi } from '../pagamenti/piani.js';
import { daPeriodo } from '../pagamenti/situazione.js';
import { PREZZI_PATH } from '../seo/paths.js';
import { FAQ_PREZZI, prezziStructuredData } from '../seo/structured-pagine.js';
import { publicCache, siteLocals } from './site.js';

/**
 * Публичната страница с цените (собственикът, 12 ноември 2026; точка 3 от одита преди пазара): плановете, които
 * наистина се продават — активните от конзолата на MASTER, и само докато плащанията са включени в среда, която
 * дава период (pagamenti/situazione.ts). Цена не се измисля: без планове страницата казва как да се попита.
 * Останалото (пробният месец, без подновяване, само четене, ДДС, връщане) е това, което казват условията, чл. 12.
 */
export const sitePrezziRouter: Router = Router();

sitePrezziRouter.get(PREZZI_PATH, async (req, res) => {
  publicCache(req, res);
  const t = res.locals.t as (k: string, p?: Record<string, string | number>) => string;
  const cliente = await clienteAttivo();
  const piani = cliente && daPeriodo(cliente.ambiente) ? await pianiAttivi() : [];
  const durata = (mesi: number) =>
    t(mesi === 1 ? 'pagamenti.mesi.uno' : 'pagamenti.mesi.altri', { n: mesi });
  const persone = (livello: number) => {
    const max = LIVELLI[livello as 1 | 2 | 3];
    return max === null
      ? t('abbonamento.livelli.oltre', { n: LIVELLI[2] ?? 25 })
      : t('abbonamento.livelli.fino', { n: max });
  };
  const livelli = ([1, 2, 3] as const)
    .map((n) => ({
      n,
      persone: persone(n),
      piani: piani
        .filter((p) => p.livello === n)
        .map((p) => ({
          durata: durata(p.mesi),
          prezzo: formatoEuro(p.prezzoCent),
          // Колко е на месец — само за сравнение, закръглено до цент.
          alMese: p.mesi > 1 ? formatoEuro(Math.round(p.prezzoCent / p.mesi)) : null,
        })),
    }))
    .filter((l) => l.piani.length > 0);
  const locals = siteLocals(req, PREZZI_PATH);
  res.render('site/prezzi', {
    ...locals,
    jsonLd: prezziStructuredData(
      t,
      locals.canonical ?? '',
      piani.map((p) => ({
        nome: t('prezzi.offerta', {
          livello: `${t('prezzi.piani.livello', { n: p.livello })} (${persone(p.livello)})`,
          durata: durata(p.mesi),
        }),
        prezzoCent: p.prezzoCent,
        mesi: p.mesi,
      })),
    ),
    livelli,
    faq: FAQ_PREZZI,
    giorniFattura: GIORNI_FATTURA,
    mesiProva: MESI_PROVA,
    aggiornato: new Date(`${PREZZI_UPDATED}T12:00:00Z`),
  });
});
