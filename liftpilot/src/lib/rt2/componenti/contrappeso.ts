// «Contrappeso» of the RT after the owner's model (round 52; sheets «Contrappeso solo inserimento» — the inputs and the
// page of the mass's change —, «guide cwt 8120» — two pages, its rails — and «VERIFICA CWT», the clearance check): the
// masses, the speed, the travel and the rated loads are the context's; the page asks the counterweight's size, its
// rails, its safety gear, the intervention («CONTRAPPESO», DG!Y79), the headroom and the pit, and the clearance's data.
// The checks with the model's corrections (differenze-guide.ts): the rails as UNI EN 81-50 5.10 asks (E-23–E-31), the
// mass's change from the masses alone and as UNI 10411-1 6.1 prospetto 2 measures it (E-33, E-34), the clearance as an
// attention (no clause, E-39). Pure.
import { fmt, mancantiCampi, num, str, verifica } from '../campi';
import { ALTRA, NOME_ALTRA, PARACADUTE_CWT } from '../cataloghi/guide';
import { RIF_GUIDE } from '../norme-guide';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, VerificaRt2 } from '../types';
import { INTERVENTI_CWT, calcolaCwt, margineCwt, pesoCwt, type CalcoloCwt, type PesoCwt } from './contrappeso-calc';
import { pagineCwt } from './contrappeso-pagine';
import { CAMPI_NORMA, CAMPI_VANO, NUMERO_GUIDE, campiAltra } from './guide-campi';
import { opzioniProfilo, type Caso } from './guide-sezione';

const conMargine = (x: DatiRt2): boolean => num(x, 'ingombroCwt') !== null;

const CAMPI: readonly CampoRt2[] = [
  { id: 'g_cwt', t: 'gruppo', label: 'Verifica contrappeso' },
  { id: 'intervento', t: 'scelta', label: 'CONTRAPPESO', opzioni: INTERVENTI_CWT, req: true },
  { id: 'dfg', t: 'num', label: 'DFG:', unit: 'mm', min: 200, max: 4000, step: 1, req: true },
  { id: 'profondita', t: 'num', label: 'Profondità cwt:', unit: 'mm', min: 30, max: 1500, step: 1, req: true },
  { id: 'numeroGuide', t: 'num', label: 'Numero guide:', ...NUMERO_GUIDE, req: true },
  { id: 'profilo', t: 'scelta', label: 'Profilo guide:', opzioni: opzioniProfilo('contrappeso', NOME_ALTRA.contrappeso), req: true },
  { id: 'l', t: 'num', label: 'Distanza massima fra gli ancoraggi:', unit: 'mm', min: 200, max: 8000, step: 1, req: true },
  { id: 'paracadute', t: 'scelta', label: 'Tipo di paracadute:', opzioni: PARACADUTE_CWT.map((r) => ({ v: String(r.n), t: r.tipo })), req: true },
  { id: 'h', t: 'num', label: 'Distanza fra i pattini:', unit: 'mm', min: 300, max: 10000, step: 1, req: true },
  ...campiAltra(ALTRA.contrappeso),
  ...CAMPI_VANO,
  { id: 'g_margine', t: 'gruppo', label: 'VERIFICA MARGINE INIZIALE CONTRAPPESO' },
  { id: 'ingombroCwt', t: 'num', label: 'Ingombro totale cwt', unit: 'mm', min: 300, max: 10000, step: 1 },
  { id: 'pilastrino', t: 'num', label: 'Pilastrino cwt', unit: 'mm', min: 0, max: 5000, step: 1, req: conMargine, show: conMargine },
  { id: 'lAmm', t: 'num', label: 'L ammortizzatore', unit: 'mm', min: 10, max: 2000, step: 1, req: conMargine, show: conMargine },
  { id: 'frecciaAmm', t: 'num', label: 'Freccia ammortizzatore', unit: 'mm', min: 0, max: 1500, step: 1, req: conMargine, show: conMargine },
  { id: 'extracorsaCwt', t: 'num', label: 'Extracorsa cwt', unit: 'mm', min: 0, max: 3000, step: 1, req: conMargine, show: conMargine },
  { id: 'extracorsaCabina', t: 'num', label: 'Extracorsa cabina', unit: 'mm', min: 0, max: 3000, step: 1, req: conMargine, show: conMargine },
  ...CAMPI_NORMA,
];

/** The model's defaults (two rails, overtravels of 300 mm, the steel over 12 %) and the intervention from the
 *  calculation's parts: the counterweight replaced («Sì») — «cwt sostituzione», else only verified. */
const proposte = (ctx: ContestoRt2): DatiRt2 => ({
  numeroGuide: 2, extracorsaCwt: 300, extracorsaCabina: 300, allungamento: 'oltre12', intervento: ctx.parti.includes('cw') ? '3' : '1',
});

const R = RIF_GUIDE, SIGMA = { unita: 'N/mm²', dec: 1 } as const;

function verificheRotaie(c: CalcoloCwt): VerificaRt2[] {
  const { run, gear } = c.amm, m = c.marcia, D = { unita: 'mm', dec: 1, rif: R.freccia } as const, nome = 'Guide del contrappeso';
  const flex = (pre: string, k: Caso, lim: number | null, dLim: number, t: string): VerificaRt2[] => [
    verifica(`contrappeso.${pre}.sm`, `${nome} ${t}: σm = σx + σy`, k.sm, '<=', lim, { ...SIGMA, rif: `${R.flessione}; ${R.eccentricita}` }),
    verifica(`contrappeso.${pre}.sf`, `${nome} ${t}: flessione della suola σf`, k.sf, '<=', lim, { ...SIGMA, rif: R.suola }),
    verifica(`contrappeso.${pre}.dx`, `${nome} ${t}: freccia δx`, k.dx, '<=', dLim, D),
    verifica(`contrappeso.${pre}.dy`, `${nome} ${t}: freccia δy`, k.dy, '<=', dLim, D),
  ];
  const out = [...flex('marcia', m, run, c.dLim, 'in marcia'),
    verifica('contrappeso.marcia.s', `${nome} in marcia: σ = σm + (Mg·g + Fp)/A`, c.sMarcia, '<=', run, { ...SIGMA, rif: R.composta })];
  const k = c.paracadute;
  if (k) {
    out.push(...flex('paracadute', k, gear, c.dLim, 'all’intervento del paracadute'),
      verifica('contrappeso.paracadute.s', `${nome} all’intervento del paracadute: σ = σm + Fv/A`, k.s, '<=', gear, { ...SIGMA, rif: R.composta }),
      verifica('contrappeso.paracadute.sc', `${nome} all’intervento del paracadute: σc = σk + 0,9·σm`, k.sc, '<=', gear, { ...SIGMA, rif: R.puntaComposta }));
  }
  return out;
}

/** The mass's change: within the tolerance or not — an attention, as the model's «ATTENZIONE»: beyond it the checks of
 *  6.1 follow, which the RT carries (generale.ts). */
export function verificaPeso(w: PesoCwt): VerificaRt2 {
  const esito = w.entro ? 'ok' as const : 'warn' as const;
  if (w.limite === null) {
    return { ...verifica('contrappeso.peso', 'Aumento della massa del contrappeso', w.dopo - w.prima, '<=', 0, { unita: 'kg', dec: 0, rif: R.peso11 }), esito };
  }
  return { ...verifica('contrappeso.peso', 'Aumento del contrappeso sulla portata (prospetto 2)', w.aumento * 100, '<=', w.limite * 100,
    { unita: '%', dec: 1, rif: R.peso1 }), esito };
}

function avvisiDi(ctx: ContestoRt2, x: DatiRt2, c: CalcoloCwt | null): string[] {
  const out: string[] = [];
  if (ctx.prima.Mcw === null) out.push('Massa del contrappeso prima della modifica non documentata: si considera uguale a quella dopo.');
  const sost = str(x, 'intervento') === '3', parte = ctx.parti.includes('cw');
  if (str(x, 'intervento') && sost !== parte) out.push(parte ? 'Il calcolo sostituisce il contrappeso: scegli «cwt sostituzione».' : 'Il calcolo non sostituisce il contrappeso.');
  if (c?.omegaNo === 'lambda') out.push(`Grado di snellezza λ = ${fmt(c.lambda, 0)}: VERIFICA GUIDE e/o STAFFE`);
  if (c?.omegaNo === 'rm' && c.paracadute) out.push(`σr = ${fmt(c.sez.Rm, 0)} N/mm²: fuori dal campo del metodo omega, carico di punta da verificare a parte`);
  if (c && c.amm.run === null) out.push('Acciaio con allungamento A5 sotto 8 %: non ammesso per le guide (UNI EN 81-20:2020, 5.7.4.5)');
  return out;
}

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const base = [...(ctx.dopo.Q === null || ctx.dopo.Mcw === null ? ['calcolo.carichi'] : []), ...(ctx.dopo.H === null ? ['calcolo.corsa'] : []),
    ...(conMargine(x) && ctx.dopo.v === null ? ['calcolo.velocita'] : [])];
  const mancanti = [...mancantiCampi(CAMPI, x, ctx), ...base], c = calcolaCwt(ctx, x), w = pesoCwt(ctx), mg = margineCwt(ctx, x);
  const verifiche: VerificaRt2[] = [...(w ? [verificaPeso(w)] : []), ...(c ? verificheRotaie(c) : [])];
  if (mg) {
    verifiche.push(verifica('contrappeso.margine', 'Margine iniziale del contrappeso con la cabina in extracorsa (verifica del modello)', mg.Mextra, '>',
      mg.minimo + mg.tiranti, { unita: 'mm', dec: 0, rif: R.margine, warn: true }));
  }
  const valori: Record<string, number | string | null> = {};
  if (c) Object.assign(valori, { profilo: c.sez.nome, i: c.i, lambda: c.lambda, omega: c.omega, Mg: c.Mg, colonna: c.colonna, XS: c.XS, YS: c.YS,
    sAmmMarcia: c.amm.run, sAmmParacadute: c.amm.gear, sMarcia: c.sMarcia, 'marcia.Fx': c.marcia.Fx, 'marcia.Fy': c.marcia.Fy, 'marcia.sm': c.marcia.sm,
    Fv: c.paracadute?.Fv ?? null, sk: c.paracadute?.sk ?? null, sc: c.paracadute?.sc ?? null });
  if (w) Object.assign(valori, { pesoPrima: w.prima, pesoDopo: w.dopo, pesoLimite: w.pesoLimite, aumento: w.aumento });
  if (mg) Object.assign(valori, { testataFossa: mg.somma, M: mg.M, Mextra: mg.Mextra, margineMinimo: mg.minimo });
  return { verifiche, mancanti, valori, avvisi: avvisiDi(ctx, x, c) };
}

export const CONTRAPPESO: ModuloRt2 = {
  id: 'contrappeso', titolo: 'Contrappeso', campi: CAMPI, proposte, calcola,
  pagine: (ctx, x, e, p) => {
    const c = calcolaCwt(ctx, x), w = pesoCwt(ctx);
    return c && w ? pagineCwt(ctx, x, c, w, margineCwt(ctx, x), e, p) : [];
  },
};
