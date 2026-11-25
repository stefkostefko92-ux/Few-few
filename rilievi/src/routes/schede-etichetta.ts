import { Router } from 'express';
import { requireCapability } from '../auth/guards.js';
import { schedaTitle } from '../schede/format.js';
import { COPIE_ETICHETTA, copieDi, qrScheda } from '../schede/etichetta.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * „Etichetta QR“ на картата (точка C6): лист A4 за печат с етикетите на уредбата — QR към картата,
 * матрикула, № на уредбата, адрес и фирмата. Който вижда картата, печата етикета ѝ.
 */
export const schedeEtichettaRouter: Router = Router();

schedeEtichettaRouter.get(
  '/schede/:id/etichetta',
  requireCapability('schede:read'),
  async (req, res) => {
    const scheda = await loadScheda(req);
    if (!scheda) return notFound(req, res);
    res.render('schede/etichetta', {
      scheda,
      ident: schedaTitle(scheda, res.locals.t),
      qr: await qrScheda(scheda.id),
      copie: copieDi(req.query.n),
      scelte: COPIE_ETICHETTA,
    });
  },
);
