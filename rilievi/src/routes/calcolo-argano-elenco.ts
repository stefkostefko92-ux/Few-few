import { calcoliDelleSchede, cercaLiberi, elencoCalcoli } from '../argano/elenco.js';
import { creaElencoRouter } from './calcolo-elenco.js';

/** „Calcolo argano“ в менюто (собственикът, 31 октомври 2026) — общата страница от calcolo-elenco.ts. */
export const calcoloElencoRouter = creaElencoRouter({
  chiave: 'argano',
  base: '/calcolo-argano',
  scheda: 'calcolo-argano',
  servizi: { elenco: elencoCalcoli, cerca: cercaLiberi, delleSchede: calcoliDelleSchede },
});
