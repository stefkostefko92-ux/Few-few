// «Guide di cabina» of the RT after the owner's model (round 52; sheets «Guide cabina solo inserimento» — the inputs —
// and «guide cabina 8120», three pages): the car rails checked as UNI EN 81-50:2020 5.10 asks, in the model's four
// cases. The loads, the speed, the travel and «Ascensore per» are the context's; the page asks the rail, the safety
// gear, the geometry and the headroom and pit (the rail column). The checks in the model's order with its corrections
// (differenze-guide.ts): deflections within 5 mm in every case and checked at the safety gear too (E-2, E-3), σ = σm +
// Fk/A (E-1), Rm/St, the least radius of gyration, ω (E-4, E-5, E-12–E-14), the load on the worse side (E-7), its
// «Distribuzione del carico» an attention only (E-8), n from its input (E-10), the second entrance (E-19), σ = σm +
// (Mg·g + Fp)/A in running and loading (E-18), the safety gear's type for the speed (E-20). Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import { KR } from '../../rt/norme';
import { fmt, mancantiCampi, num, str, verifica } from '../campi';
import { ALTRA, NOME_ALTRA, PARACADUTE_CABINA, istantaneo } from '../cataloghi/guide';
import { RIF_GUIDE } from '../norme-guide';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, VerificaRt2 } from '../types';
import { CAMPI_NORMA, CAMPI_VANO, NUMERO_GUIDE, campiAltra } from './guide-campi';
import { calcolaCabina, type CalcoloCabina } from './guide-cabina-calc';
import { pagineCabina } from './guide-cabina-pagine';
import type { Caso } from './guide-sezione';
import { opzioniProfilo } from './guide-sezione';

const senzaXQ = (x: DatiRt2): boolean => num(x, 'XQ') === null, senzaYQ = (x: DatiRt2): boolean => num(x, 'YQ') === null;

const CAMPI: readonly CampoRt2[] = [
  { id: 'g_guide', t: 'gruppo', label: 'Verifica guide cabina' },
  { id: 'numeroGuide', t: 'num', label: '39. Numero guide:', ...NUMERO_GUIDE, req: true },
  { id: 'profilo', t: 'scelta', label: '40. Profilo guide:', opzioni: opzioniProfilo('cabina', NOME_ALTRA.cabina), req: true },
  { id: 'larghezza', t: 'num', label: 'larghezza cabina:', unit: 'mm', min: 300, max: 5000, step: 1, req: senzaYQ },
  { id: 'profondita', t: 'num', label: 'profondità cabina:', unit: 'mm', min: 300, max: 6000, step: 1, req: senzaXQ },
  { id: 'l', t: 'num', label: '41. Distanza massima fra gli ancoraggi:', unit: 'mm', min: 200, max: 8000, step: 1, req: true },
  { id: 'h', t: 'num', label: 'Distanza fra i pattini:', unit: 'mm', min: 300, max: 10000, step: 1, req: true },
  { id: 'paracadute', t: 'scelta', label: '38. Tipo di paracadute:', opzioni: PARACADUTE_CABINA.map((r) => ({ v: String(r.n), t: r.tipo })), req: true },
  ...campiAltra(ALTRA.cabina),
  { id: 'g_baricentro', t: 'gruppo', label: 'DISTANZA BARICENTRO - ASSI GUIDE' },
  { id: 'Xc', t: 'num', label: 'Xc =', unit: 'mm', min: -3000, max: 3000, step: 1, req: true },
  { id: 'Yc', t: 'num', label: 'Yc =', unit: 'mm', min: -3000, max: 3000, step: 1, req: true },
  { id: 'g_funi', t: 'gruppo', label: 'DISTANZA TIRO FUNI - ASSI GUIDE' },
  { id: 'Xs', t: 'num', label: 'Xs =', unit: 'mm', min: -3000, max: 3000, step: 1, req: true },
  { id: 'Ys', t: 'num', label: 'Ys =', unit: 'mm', min: -3000, max: 3000, step: 1, req: true },
  { id: 'g_q', t: 'gruppo', label: 'RIPARTIZIONE Q SU ASSE X / ASSE Y' },
  { id: 'XQ', t: 'num', label: 'XQ =', unit: 'mm', min: 0, max: 1500, step: 1 },
  { id: 'YQ', t: 'num', label: 'YQ =', unit: 'mm', min: 0, max: 1500, step: 1 },
  { id: 'g_porta', t: 'gruppo', label: 'Distanza tra il centro porta e gli assi delle guide' },
  { id: 'Xi', t: 'num', label: 'Xi =', unit: 'mm', min: -4000, max: 4000, step: 1, req: true },
  { id: 'Yi', t: 'num', label: 'Yi =', unit: 'mm', min: -4000, max: 4000, step: 1, req: true },
  { id: 'Xi2', t: 'num', label: 'Xi = (secondo accesso)', unit: 'mm', min: -4000, max: 4000, step: 1, esperto: true },
  { id: 'Yi2', t: 'num', label: 'Yi = (secondo accesso)', unit: 'mm', min: -4000, max: 4000, step: 1, esperto: true },
  ...CAMPI_VANO,
  ...CAMPI_NORMA,
];

/** The model's defaults: two rails, the car's centre and the ropes on the rails' axes, the door centred on the X axis;
 *  the steel over 12 % (UNI EN 81-20:2020 prospetto 15, the usual rail steels). */
const proposte = (): DatiRt2 => ({ numeroGuide: 2, Xc: 0, Yc: 0, Xs: 0, Ys: 0, Yi: 0, allungamento: 'oltre12' });

const R = RIF_GUIDE, SIGMA = { unita: 'N/mm²', dec: 1 } as const, DELTA = { unita: 'mm', dec: 1, rif: R.freccia } as const;

/** σm, σF and the two deflections of a case (`warn`: an attention when not met). */
function verificheCaso(pre: string, nome: string, k: Caso, lim: number | null, o: { rif?: string; warn?: boolean; dec?: number } = {}): VerificaRt2[] {
  const w = o.warn ? { warn: true } : {}, dec = o.dec ?? 1, rif = (r: string): string => (o.rif ? `${r}; ${o.rif}` : r);
  return [
    verifica(`guideCabina.${pre}.sm`, `${nome}: σm = σx + σy`, k.sm, '<=', lim, { ...SIGMA, dec, rif: rif(R.flessione), ...w }),
    verifica(`guideCabina.${pre}.sf`, `${nome}: flessione della suola σf`, k.sf, '<=', lim, { ...SIGMA, dec, rif: rif(R.suola), ...w }),
    verifica(`guideCabina.${pre}.dx`, `${nome}: freccia δx`, k.dx, '<=', KV_GUIDE.railDeflection, { ...DELTA, ...w }),
    verifica(`guideCabina.${pre}.dy`, `${nome}: freccia δy`, k.dy, '<=', KV_GUIDE.railDeflection, { ...DELTA, ...w }),
  ];
}

function verificheCabina(c: CalcoloCabina, ctx: ContestoRt2): VerificaRt2[] {
  const { run, gear } = c.amm, pg = c.paracadute;
  const out: VerificaRt2[] = [
    ...verificheCaso('marcia', 'Guide di cabina in marcia', c.marcia, run),
    verifica('guideCabina.marcia.s', 'Guide di cabina in marcia: σ = σm + (Mg·g + Fp)/A', c.sMarcia, '<=', run, { ...SIGMA, rif: R.composta }),
    ...verificheCaso('distr', 'Distribuzione del carico (caso del modello)', c.distr, run, { warn: true }),
    verifica('guideCabina.paracadute.sm', 'Guide di cabina all’intervento del paracadute: σm = σx + σy', pg.sm, '<=', gear, { ...SIGMA, rif: R.flessione }),
    verifica('guideCabina.paracadute.s', 'Guide di cabina all’intervento del paracadute: σ = σm + Fk/A', pg.s, '<=', gear, { ...SIGMA, rif: R.composta }),
    verifica('guideCabina.paracadute.sc', 'Guide di cabina all’intervento del paracadute: σc = σk + 0,9·σm', pg.sc, '<=', gear, { ...SIGMA, rif: R.puntaComposta }),
    verifica('guideCabina.paracadute.sf', 'Guide di cabina all’intervento del paracadute: flessione della suola σf', pg.sf, '<=', gear, { ...SIGMA, rif: R.suola }),
    verifica('guideCabina.paracadute.dx', 'Guide di cabina all’intervento del paracadute: freccia δx', pg.dx, '<=', KV_GUIDE.railDeflection, DELTA),
    verifica('guideCabina.paracadute.dy', 'Guide di cabina all’intervento del paracadute: freccia δy', pg.dy, '<=', KV_GUIDE.railDeflection, DELTA),
    ...verificheCaso('carico', 'Guide di cabina al carico al piano', c.carico, run, { rif: R.carico, dec: 2 }),
    verifica('guideCabina.carico.s', 'Guide di cabina al carico al piano: σ = σm + (Mg·g + Fp)/A', c.sCarico, '<=', run, { ...SIGMA, dec: 2, rif: `${R.composta}; ${R.carico}` }),
  ];
  if (c.carico2) {
    out.push(...verificheCaso('carico2', 'Guide di cabina al carico al piano, secondo accesso', c.carico2, run, { rif: R.carico, dec: 2 }),
      verifica('guideCabina.carico2.s', 'Guide di cabina al carico al piano, secondo accesso: σ = σm + (Mg·g + Fp)/A', c.sCarico2, '<=', run,
        { ...SIGMA, dec: 2, rif: `${R.composta}; ${R.carico}` }));
  }
  const v = ctx.dopo.v;
  if (istantaneo(c.gear.n) && v !== null) {
    out.push(verifica('guideCabina.tipoParacadute', `Paracadute ${c.gear.tipo.toLowerCase()}: velocità nominale`, v, '<=', KV_GUIDE.gearInstantV,
      { unita: 'm/s', dec: 2, rif: R.paracadute }));
  }
  return out;
}

const LAMBDA_MAX = KV_GUIDE.omega370[KV_GUIDE.omega370.length - 1][0];
const CASI: readonly (keyof Caso)[] = ['Fx', 'My', 'sy', 'Fy', 'Mx', 'sx', 'sm', 'sf', 'dx', 'dy'];

function valoriDi(c: CalcoloCabina): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {
    profilo: c.sez.nome, i: c.i, lambda: c.lambda, omega: c.omega, sAmmMarcia: c.amm.run, sAmmParacadute: c.amm.gear, colonna: c.colonna, Mg: c.Mg,
    K1: c.K1, Fs: c.carico.Fs, Fk: c.paracadute.Fk, sk: c.paracadute.sk, s: c.paracadute.s, sc: c.paracadute.sc, sMarcia: c.sMarcia, sCarico: c.sCarico,
  };
  const casi: [string, Caso | null][] = [['marcia', c.marcia], ['distr', c.distr], ['paracadute', c.paracadute], ['carico', c.carico], ['carico2', c.carico2]];
  for (const [nome, k] of casi) if (k) for (const q of CASI) out[`${nome}.${q}`] = k[q];
  return out;
}

/** The avvisi of the screen: the model's hint for the safety gear by the speed (instantaneous up to 0,63 m/s included:
 *  E-20), ω not applicable, the steel not admitted. */
function avvisiDi(ctx: ContestoRt2, x: DatiRt2, c: CalcoloCabina | null): string[] {
  const out: string[] = [], v = ctx.dopo.v;
  if (!str(x, 'paracadute') && v !== null) out.push(`Velocità ${fmt(v, 2)} m/s: ${v <= KV_GUIDE.gearInstantV + 1e-9 ? 'presa istantanea a rulli' : 'presa progressiva'}`);
  if (c?.omegaNo === 'lambda') out.push(`Grado di snellezza λ = ${fmt(c.lambda, 0)}: VERIFICA GUIDE e/o STAFFE (oltre ${LAMBDA_MAX} il metodo omega non si applica)`);
  if (c?.omegaNo === 'rm') {
    out.push(`σr = ${fmt(c.sez.Rm, 0)} N/mm²: fuori dal campo ${KR.railRmMin}–${KR.railRmMax} N/mm² del metodo omega, carico di punta da verificare a parte`);
  }
  if (c && c.amm.run === null) out.push('Acciaio con allungamento A5 sotto 8 %: non ammesso per le guide (UNI EN 81-20:2020, 5.7.4.5)');
  return out;
}

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const base = [...(ctx.dopo.Q === null || ctx.dopo.P === null ? ['calcolo.carichi'] : []), ...(ctx.dopo.H === null ? ['calcolo.corsa'] : [])];
  const mancanti = [...mancantiCampi(CAMPI, x, ctx), ...base], c = calcolaCabina(ctx, x);
  if (!c) return { verifiche: [], mancanti, valori: {}, avvisi: avvisiDi(ctx, x, null) };
  return { verifiche: verificheCabina(c, ctx), mancanti, valori: valoriDi(c), avvisi: avvisiDi(ctx, x, c) };
}

export const GUIDE_CABINA: ModuloRt2 = {
  id: 'guideCabina', titolo: 'Guide di cabina', campi: CAMPI, proposte, calcola,
  pagine: (ctx, x, e, p) => {
    const c = calcolaCabina(ctx, x);
    return c ? pagineCabina(c, e, p) : [];
  },
};
