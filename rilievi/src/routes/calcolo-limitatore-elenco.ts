import { calcoliDelleSchede, cercaLiberi, elencoCalcoli } from '../limitatore/elenco.js';
import { creaElencoRouter } from './calcolo-elenco.js';

/** „Calcolo limitatore“ в менюто (собственикът, 5 ноември 2026) — общата страница от calcolo-elenco.ts. */
export const limitatoreElencoRouter = creaElencoRouter({
  chiave: 'limitatore',
  base: '/calcolo-limitatore',
  scheda: 'calcolo-limitatore',
  servizi: { elenco: elencoCalcoli, cerca: cercaLiberi, delleSchede: calcoliDelleSchede },
});
