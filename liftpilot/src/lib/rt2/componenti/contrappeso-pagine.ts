// The printed pages of «Contrappeso» of the RT after the owner's model (round 52): its rails in running and, with a
// safety gear only, at its operation (sheet «guide cwt 8120», print area A2:N147; E-28) and the page of the mass's change
// (sheet «Contrappeso solo inserimento», A78:J135) with, when its data are given, the model's clearance check («VERIFICA
// CWT», A1:I23). The model's texts verbatim where they state what LiftPilot computes; where its formula is corrected
// (the guiding forces over the shoes' distance, not «vertical» forces over the rail's weight: E-23) the page writes the
// formula computed; the model's «< = σamm/3,75» beside σy and σx is dropped (E-31), its duplicate rows 29–30 too
// (E-27); the edition of UNI 10411 is the one of the RT (E-36). Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import type { FBlock, FRiga } from '../../report/rt2/model';
import { KR } from '../../rt/norme';
import { fmt, num, str } from '../campi';
import type { ContestoRt2, DatiRt2, EsitoRt2, EsitoVerificaRt2, PaginaCtx } from '../types';
import { INTERVENTI_CWT, type CalcoloCwt, type MargineCwt, type PesoCwt } from './contrappeso-calc';
import type { Caso } from './guide-sezione';
import { righeCorrezioni, valore } from './righe';

const pct = (x: number): string => fmt(x * 100, 0);

/** The three lines of the mass's change (the model's A99:A101 by its verdict; under UNI 10411-11 ours). */
export function testiPeso(ctx: ContestoRt2, w: PesoCwt): string[] {
  const T = 'Il nuovo valore del carico statico Tcp, nel tratto delle funi lato contrappeso, ';
  if (w.limite === null) {
    const n = 'della norma UNI 10411-11 : 2024';
    return w.entro
      ? [`${T}non aumenta rispetto a quello documentato`, 'Pertanto non si rende necessario alcun intervento secondo', `quanto previsto dal paragrafo 6, punto 6.1, ${n}`]
      : [`${T}aumenta rispetto a quello documentato`, '(paragrafo 6, punto 6.1). Pertanto si rende necessario intervenire secondo',
        `quanto previsto dal paragrafo 6, punti da 6.2 a 6.13 ${n}`];
  }
  const n = ctx.norma === '10411-1' ? 'UNI 10411-1 : 2024' : 'UNI 10411-11 : 2024';
  return w.entro
    ? [`${T}rientra nella tolleranza del ${pct(w.limite)}%`, 'Pertanto non si rende necessario alcun intervento secondo',
      `quanto previsto dal paragrafo 6, punto 6.1, prospetto 2, della norma ${n}`]
    : [`${T}non rientra nella tolleranza del ${pct(w.limite)}%`, '(paragrafo 6, punto 6.1, prospetto 2). Pertanto si rende necessario intervenire secondo',
      `quanto previsto dal paragrafo 6, punto 6.1 della norma ${n}`];
}

export function pagineCwt(ctx: ContestoRt2, x: DatiRt2, c: CalcoloCwt, w: PesoCwt, mg: MargineCwt | null, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const es = (id: string): EsitoVerificaRt2 | undefined => e.verifiche.find((v) => v.id === id)?.esito;
  const { sez: S, amm } = c, run = fmt(amm.run, 1), gear = fmt(amm.gear, 1), dLim = `≤ ${fmt(c.dLim, 0)} mm`;
  const chk = (formula: string, sym: string, v: number | null, id: string, lim: string): FRiga => valore(formula, sym, fmt(v, 1), lim, es(id));
  const flessione = (pre: string, k: Caso, K: string, lim: string): FBlock[] => [
    { t: 'sez', l: 'Sollecitazione di flessione asse Y', righe: [
      valore(`Fx = (${K} x gN  x Mcwt x Xs) / (n x h)`, 'Fx', fmt(k.Fx, 1), 'N'), valore('My = 3 Fx l / 16', 'My', fmt(k.My, 1), 'Nmm'),
      valore('σy = My / Wy', 'σy', fmt(k.sy, 1), 'N/mm2'),
    ] },
    { t: 'sez', l: 'Sollecitazione di flessione asse X', righe: [
      valore(`Fy = (${K} x gN  x Mcwt x Ys) / (n/2 x h)`, 'Fy', fmt(k.Fy, 1), 'N'), valore('Mx = 3 Fy l / 16', 'Mx', fmt(k.Mx, 1), 'Nmm'),
      valore('σx = Mx / Wx', 'σx', fmt(k.sx, 1), 'N/mm2'),
      chk('σm = σx + σy  ≤  σperm', 'σm', k.sm, `contrappeso.${pre}.sm`, `≤ ${lim}`), chk('σf = 1,85 Fx / c2', 'σf', k.sf, `contrappeso.${pre}.sf`, `≤ ${lim}`),
    ] },
    { t: 'sez', l: 'Freccia', righe: [
      chk('δx = 0,7 Fx l3 / ( 48 E Jy )', 'δx', k.dx, `contrappeso.${pre}.dx`, dLim), chk('δy = 0,7 Fy l3 / ( 48 E Jx )', 'δy', k.dy, `contrappeso.${pre}.dy`, dLim),
    ] },
  ];
  const oltre = c.lambda > KV_GUIDE.omega370[KV_GUIDE.omega370.length - 1][0];
  const pagina1: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'CONTRAPPESO', righe: [
      valore('Profilo guide', '', S.nome), valore('Sezione', 'A', fmt(S.A, 0), 'mm2'), valore('Raggio d\'inerzia', 'i', fmt(c.i, 2), 'mm'),
      valore('Sezione critica della guida', 'c', fmt(S.c, 1), 'mm'), valore('Tensione di rottura del materiale', 'σr', fmt(S.Rm, 0), 'N/mm2'),
      valore('Tensione ammissibile durante l\'uso normale', 'σamm', run, 'N/mm2'),
      valore('Tens. ammis. durante l\'intervento del paracadute', 'σamm', gear, 'N/mm2'), valore('Modulo d\'elasticità', 'E', fmt(c.E, 0), 'N/mm2'),
      valore('Distanza massima ancoraggi', 'l', fmt(c.l, 0), 'mm'), valore('Distanza fra i pattini', 'h', fmt(c.h, 1), 'mm'),
      valore('Grado di snellezza', 'λ', fmt(c.lambda, 0), oltre ? 'VERIFICA GUIDE e/o STAFFE' : ''),
      valore('Coefficiente di maggiorazione carico di punta', 'ω', c.omega === null ? 'n.a.' : fmt(c.omega, 2)),
      valore('Contrappeso', 'P', fmt(c.Mcw, 0), 'Kg'), valore('N° delle guide', 'n', fmt(c.n, 0)), valore('Tipo di paracadute', '', c.gear.tipo),
      valore('Coefficiente dinamico dovuto all\'intervento del paracadute', 'K1', c.K1 === null ? '—' : fmt(c.K1, 0)),
      valore('Coefficiente dinamico dovuto alla marcia', 'K2', fmt(c.K2, 1)),
      valore('Modulo di resistenza elastico della sez. trasversale', 'Wxx', fmt(S.Wx, 0), 'mm3'),
      valore('Modulo di resistenza elastico della sez. trasversale', 'Wyy', fmt(S.Wy, 0), 'mm3'),
      valore('Momento d\'inerzia della sezione delle guide (asse Y)', 'Jy', fmt(S.Jy, 0), 'mm4'),
      valore('Momento d\'inerzia della sezione delle guide (asse X)', 'Jx', fmt(S.Jx, 0), 'mm4'),
      valore('Massa n.1 colonna guida', 'Mg', fmt(c.Mg, 0), 'Kg'),
    ] },
    { t: 'sez', l: 'Geometria (1)', righe: [
      valore('Distanza tra il centro contrappeso e l\'asse  Y delle guide', 'XS', fmt(c.XS, 0), 'mm'),
      valore('Distanza tra il centro contrappeso e l\'asse  X delle guide', 'YS', fmt(c.YS, 0), 'mm'),
      { t: 'testo', s: `XS = ${fmt(KV_GUIDE.cwEccDepth * 100, 0)} % della profondità del contrappeso, YS = ${fmt(KV_GUIDE.cwEccWidth * 100, 0)} % della distanza fra le guide DFG.` },
    ] },
    { t: 'testo', s: '(1) Geometria - Verifica delle guide con applicazione carichi secondo appendice C.2 EN 81.50', nota: true },
    { t: 'testo', s: 'Calcolo  GUIDE CONTRAPPESO durante l\'uso normale in marcia', b: true },
    ...flessione('marcia', c.marcia, 'K2', run),
    ...righeCorrezioni(e.verifiche.filter((v) => v.id === 'contrappeso.marcia.s')),
  ];
  const k = c.paracadute;
  const pagina2: FBlock[] = !k ? [] : [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'testo', s: 'Calcolo  GUIDE CONTRAPPESO durante l\'intervento del paracadute', b: true },
    ...flessione('paracadute', k, 'K1', gear),
    { t: 'sez', l: 'Verifica a carico di punta', righe: [
      valore('Fv = [ K1 gN  Mcwt /  n ] + [Mg gn] + Fp', 'Fv', fmt(k.Fv, 1), 'N'), valore('σk = Fv ω / A', 'σk', fmt(k.sk, 1), 'N/mm2'),
      ...(c.omegaNo === 'lambda' ? [{ t: 'testo' as const, s: 'VERIFICA GUIDE e/o STAFFE', b: true }]
        : c.omegaNo === 'rm' ? [{ t: 'testo' as const, s: `σr fuori dal campo ${KR.railRmMin}–${KR.railRmMax} N/mm² del metodo omega: carico di punta non verificabile con ω.` }] : []),
      chk('σ = σm + Fv  / A', 'σ', k.s, 'contrappeso.paracadute.s', `≤ ${gear}`),
      chk('σc = σk + 0,9  σm ≤  σperm', 'σc', k.sc, 'contrappeso.paracadute.sc', `≤ ${gear}`),
    ] },
  ];
  const testi = testiPeso(ctx, w), interv = INTERVENTI_CWT.find((o) => o.v === str(x, 'intervento'))?.t ?? '—';
  const aumento: FRiga = w.limite === null
    ? valore('Aumento del contrappeso:', 'ΔMcwt', `${fmt(w.dopo - w.prima, 0)} kg`, '', es('contrappeso.peso'))
    : valore('Aumento del contrappeso sulla portata:', 'ΔTcp', `${fmt(w.aumento * 100, 1)} %`, `≤ ${pct(w.limite)} %`, es('contrappeso.peso'));
  const pagina3: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Contrappeso:', righe: [
      valore('DFG mm:', '', fmt(num(x, 'dfg'), 0)), valore('Profondità cwt mm:', '', fmt(num(x, 'profondita'), 0)),
      valore('Peso cwt origine kg:', '', fmt(w.prima, 0)), valore('Peso cwt modificato kg:', '', fmt(w.dopo, 0)),
      valore('Intervento:', '', interv), aumento,
    ] },
    { t: 'sez', l: '', righe: [
      ...testi.map((s): FRiga => ({ t: 'testo', s })),
      ...(w.calo ? [{ t: 'testo' as const, s: 'Il contrappeso diminuisce rispetto a quello documentato: secondo il paragrafo 6, punto 6.1 si verificano anche gli ammortizzatori e il paracadute progressivo.' }] : []),
    ] },
    ...(mg ? [margine(mg, es('contrappeso.margine'))] : []),
  ];
  return [...pagina1, ...pagina2, ...pagina3];
}

/** «VERIFICA CWT»: its lines as the model prints them (its label of F21 corrected: 35·v² in mm, E-38), its verdict, and
 *  the note that it is the model's own check. */
function margine(m: MargineCwt, esito: EsitoVerificaRt2 | undefined): FBlock {
  const mm = (l: string, v: number): FRiga => valore(l, '', fmt(v, 0), 'mm');
  return { t: 'sez', l: 'VERIFICA MARGINE INIZIALE CONTRAPPESO', righe: [
    mm('TESTATA', m.testata), mm('FOSSA', m.fossa), valore('VELOCITA\'', '', fmt(m.v, 2), 'm/s'),
    mm('Testata + fossa', m.somma), mm('Ingombro totale cwt', m.ingombro), mm('Pilastrino cwt', m.pilastrino), mm('L ammortizzatore', m.L),
    mm('Freccia ammortizzatore', m.f), mm('Extracorsa cwt', m.extraCwt), mm('Extracorsa cabina', m.extraCabina), mm('M in condizioni normali', m.M),
    valore('M con cabina in extracorsa', '', fmt(m.Mextra, 0), `> ${fmt(m.minimo + m.tiranti, 0)} mm`, esito),
    mm('300 + 35 * V^2', m.minimo), mm('ingombro tiranti', m.tiranti),
    { t: 'testo', s: esito === 'ok' ? 'MARGINE CWT OK' : 'ATTENZIONE, MARGINE CWT INSUFFICIENTE', b: true },
    { t: 'testo', s: 'Verifica del modello, senza un punto di norma: un margine insufficiente è un\'attenzione.' },
  ] };
}
