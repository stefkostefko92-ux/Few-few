// «Ammortizzatori di cabina» and «Ammortizzatori del contrappeso» of the RT after the owner's model (round 52): the
// model's six buffer sheets — «Amm. a molla …», «Amm. in autan …», «Amm. idraulici …», for the cabin and their
// cell-for-cell copies for the counterweight (CWT) — as one module per side, the type its first field «tipo» (one type
// and one number of buffers per side: X2). The side differs only in its labels' numbers, the default number of buffers
// and the static load (the car with its rated load, or the counterweight); everything else is shared: the form
// (amm-campi.ts), the model's formulas (amm-calcolo.ts), the checks with their corrections (amm-esito.ts), the page
// (amm-pagine.ts), the catalogues (cataloghi/ammortizzatori.ts), the registry (norme-amm.ts) and the list of the
// differences from the model (differenze-amm.ts). Pure.
import type { ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx } from '../types';
import { campiAmm, LATO_CABINA, LATO_CWT, proposteAmm, type LatoAmm } from './amm-campi';
import { esitoAmm } from './amm-esito';
import { pagineAmm } from './amm-pagine';

function moduloAmm(l: LatoAmm): ModuloRt2 {
  const campi = campiAmm(l), proposte = proposteAmm(l);
  return {
    id: l.id, titolo: l.titolo, campi, proposte,
    calcola: (ctx: ContestoRt2, x: DatiRt2): EsitoRt2 => esitoAmm(l, campi, ctx, x),
    // the page prints the values of the result (calcola on the same inputs)
    pagine: (_ctx: ContestoRt2, _x: DatiRt2, e: EsitoRt2, p: PaginaCtx) => pagineAmm(l, e, p),
  };
}

export const AMM_CABINA: ModuloRt2 = moduloAmm(LATO_CABINA);
export const AMM_CWT: ModuloRt2 = moduloAmm(LATO_CWT);
