// The three printed pages of «Guide di cabina» of the RT after the owner's model (round 52, sheet «guide cabina 8120»,
// print area A1:M169 broken after rows 51 and 103): the general data and the geometry; running and the model's
// «Distribuzione del carico»; the safety gear's operation with its summary and the loading at a floor. The model's
// texts verbatim (its Symbol-font letters as σ, δ, λ, ω, ≤), its decimals; the outcome on each check's line; where a
// correction makes a sentence of the model false, ours (the load on both sides of the car's centre, the case the norm
// has not, ω not applicable). Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import type { FBlock, FRiga } from '../../report/rt2/model';
import { KR } from '../../rt/norme';
import { fmt } from '../campi';
import type { EsitoRt2, EsitoVerificaRt2, PaginaCtx } from '../types';
import type { CalcoloCabina } from './guide-cabina-calc';
import type { Caso } from './guide-sezione';
import { righeCorrezioni, valore } from './righe';

const MAT = '(secondo  App. C, EN 81.50)', D5 = `≤ ${fmt(KV_GUIDE.railDeflection, 0)} mm`;
const FUORI_RM = `σr fuori dal campo ${KR.railRmMin}–${KR.railRmMax} N/mm² del metodo omega: carico di punta non verificabile con ω.`;

/** «±175» or «−20 ± 175»: the rated load's position from the rails' axis, on both sides of the car's centre (E-7). */
const posQ = (C: number, q: number): string => (C === 0 ? `± ${fmt(q, 0)}` : `${fmt(C, 0)} ± ${fmt(q, 0)}`);

export function pagineCabina(c: CalcoloCabina, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const es = (id: string): EsitoVerificaRt2 | undefined => e.verifiche.find((v) => v.id === id)?.esito;
  const { sez: S, geo: g, amm } = c, run = fmt(amm.run, 1), gear = fmt(amm.gear, 1);
  const chk = (formula: string, sym: string, v: number | null, dec: number, id: string, lim: string): FRiga => valore(formula, sym, fmt(v, dec), lim, es(id));
  const freccia = (pre: string, k: Caso, dec = 1): FBlock => ({ t: 'sez', l: 'Freccia', righe: [
    chk('δx = 0,7 Fx l3 / ( 48 E Jy )', 'δx', k.dx, dec, `guideCabina.${pre}.dx`, D5),
    chk('δy = 0,7 Fy l3 / ( 48 E Jx )', 'δy', k.dy, dec, `guideCabina.${pre}.dy`, D5),
  ] });
  const pagina1: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Calcolo di verifica delle guide della cabina', righe: [{ t: 'testo', s: 'Calcolo in accordo con appendice C , EN 81.50' }] },
    { t: 'sez', l: 'Caratteristiche generali', righe: [
      valore('Normativa', '', 'ISO 7465'), valore('Profilo guide lato cabina', '', S.nome),
      valore('Modulo d\'elasticità', 'E', fmt(c.E, 0), 'N/mm2'), valore('Sezione', 'A', fmt(S.A, 0), 'mm2'),
      valore('Raggio d\'inerzia', 'i', fmt(c.i, 2), 'mm'), valore('Distanza massima ancoraggi', 'l', fmt(c.l, 0), 'mm'),
      valore('Distanza fra i pattini', 'h', fmt(c.h, 0), 'mm'), valore('Larghezza della superficie di scorrimento', 'lsc', fmt(S.lsc, 1), 'mm'),
      valore('Grado di snellezza', 'λ', fmt(c.lambda, 0)), valore('Tensione di rottura del materiale', 'σr', fmt(S.Rm, 0), 'N/mm2'),
      valore('Tensione ammissibile durante l\'uso normale', 'σamm', run, 'N/mm2'),
      valore('Tens. ammis. durante l\'intervento del paracadute', 'σamm', gear, 'N/mm2'),
      valore('Coefficiente di maggiorazione carico di punta', 'ω', c.omega === null ? 'n.a.' : fmt(c.omega, 2)),
      valore('Peso della cabina, cavi flessibili, catena/fune compensazione', 'P', fmt(c.P, 0), 'Kg'), valore('Portata', 'Q', fmt(c.Q, 0), 'Kg'),
      valore('N° delle guide', 'n', fmt(c.n, 0)), valore('Tipo di paracadute', '', c.gear.tipo),
      valore('Coefficiente dinamico dovuto all\'intervento del paracadute', 'K1', fmt(c.K1, 0), MAT),
      valore('Coefficiente dinamico dovuto alla marcia', 'K2', fmt(c.K2, 1), MAT),
      valore('Modulo di resistenza elastico della sez. trasversale', 'Wxx', fmt(S.Wx, 0), 'mm3'),
      valore('Modulo di resistenza elastico della sez. trasversale', 'Wyy', fmt(S.Wy, 0), 'mm3'),
      valore('Momento d\'inerzia della sezione delle guide (asse Y)', 'Jy', fmt(S.Jy, 0), 'mm4'),
      valore('Momento d\'inerzia della sezione delle guide (asse X)', 'Jx', fmt(S.Jx, 0), 'mm4'),
      valore('Massa n.1 colonna guida', 'Mg', fmt(c.Mg, 0), 'Kg'),
    ] },
    { t: 'sez', l: 'Geometria (1)', righe: [
      valore('Distanza tra il centro cabina e l\'asse  Y delle guide', 'XC = XP', fmt(g.Xc, 0), 'mm'),
      valore('Distanza tra il centro cabina e l\'asse  X delle guide', 'YC = Yp', fmt(g.Yc, 0), 'mm'),
      valore('Distanza tra le funi e l\'asse Y delle guide', 'XS', fmt(g.Xs, 0), 'mm'),
      valore('Distanza tra le funi e l\'asse X delle guide', 'YS', fmt(g.Ys, 0), 'mm'),
      valore('Posiz. Q rispetto l\'asse Y per la ripartizione di Q su X', 'XQx', posQ(g.Xc, g.XQ), 'mm'),
      valore('Posiz. Q rispetto l\'asse X per la ripartizione di Q su X', 'YQx', fmt(g.Yc, 0), 'mm'),
      valore('Posiz. Q rispetto l\'asse Y per la ripartizione di Q su Y', 'XQy', fmt(g.Xc, 0), 'mm'),
      valore('Posiz. Q rispetto l\'asse X per la ripartizione di Q su Y', 'YQy', posQ(g.Yc, g.YQ), 'mm'),
      valore('Distanza tra il centro porta e l\'asse Y delle guide', 'Xi', fmt(g.Xi, 0), 'mm'),
      valore('Distanza tra il centro porta e l\'asse X delle guide', 'Yi', fmt(g.Yi, 0), 'mm'),
      { t: 'testo', s: 'La portata è spostata dal centro della cabina di XQ e di YQ in un senso e nell\'altro: in ogni caso vale il verso più gravoso.' },
    ] },
    { t: 'testo', s: '(1) Geometria - Verifica delle guide con applicazione carichi secondo appendice C.2 EN 81.50', nota: true },
  ];
  const m = c.marcia, d = c.distr;
  const pagina2: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'testo', s: 'Calcolo  GUIDE CABINA durante l\'uso normale in marcia', b: true },
    { t: 'sez', l: 'Sollecitazione di flessione asse Y', righe: [
      valore('Fx = K2  gN  [ Q*(XQX-Xs) + P*(Xc-Xs)] / (n x h)', 'Fx', fmt(m.Fx, 1), 'N'), valore('My = 3 Fx l / 16', 'My', fmt(m.My, 1), 'Nmm'),
      valore('σy = My / Wy', 'σy', fmt(m.sy, 1), 'N/mm2'),
    ] },
    { t: 'sez', l: 'Sollecitazione di flessione asse X', righe: [
      valore('Fy = K2  gN  [ Q*( YQy - Ys ) + P*( Yc - Ys )] / ( n/2  h)', 'Fy', fmt(m.Fy, 1), 'N'), valore('Mx = 3 Fy l / 16', 'Mx', fmt(m.Mx, 1), 'Nmm'),
      valore('σx = Mx / Wx', 'σx', fmt(m.sx, 1), 'N/mm2'),
      chk('σm = σx + σy  ≤  σperm', 'σm', m.sm, 1, 'guideCabina.marcia.sm', `≤ ${run}`),
      chk('σf = 1,85 Fx / c2', 'σf', m.sf, 1, 'guideCabina.marcia.sf', `≤ ${run}`),
    ] },
    freccia('marcia', m),
    { t: 'testo', s: 'Distribuzione del carico: caso aggiuntivo del modello, non previsto dalla UNI EN 81-50; un esito non verificato è un\'attenzione.', nota: true },
    { t: 'sez', l: 'Distribuzione del carico rispetto asse Y', righe: [
      valore('Fx = K1  gN  [ Q*(XQX-Xs) + P*(Xc-Xs)] / (n x h)', 'Fx', fmt(d.Fx, 1), 'N'), valore('My = 3 Fvx l / 16', 'My', fmt(d.My, 1), 'Nmm'),
      valore('σy = My / Wy', 'σy', fmt(d.sy, 1), 'N/mm2'),
    ] },
    { t: 'sez', l: 'Distribuzione del carico rispetto asse X', righe: [
      valore('Fy = K1  gN  [ Q*( YQy - Ys ) + P*( Yc - Ys )] / ( n/2  h)', 'Fy', fmt(d.Fy, 1), 'N'), valore('Mx = 3 Fvy l / 16', 'Mx', fmt(d.Mx, 1), 'Nmm'),
      valore('σx = Mx / Wx', 'σx', fmt(d.sx, 1), 'N/mm2'),
      chk('σm = σx + σy  ≤  σamm', 'σm', d.sm, 1, 'guideCabina.distr.sm', `≤ ${run}`),
      chk('σf = 1,85 Fx / c2', 'σf', d.sf, 1, 'guideCabina.distr.sf', `≤ ${run}`),
    ] },
    freccia('distr', d),
    ...righeCorrezioni(e.verifiche.filter((v) => v.id === 'guideCabina.marcia.s')),
  ];
  const k = c.paracadute, l = c.carico;
  const omegaNo: FRiga[] = c.omegaNo === 'lambda' ? [{ t: 'testo', s: 'VERIFICA GUIDE e/o STAFFE', b: true }]
    : c.omegaNo === 'rm' ? [{ t: 'testo', s: FUORI_RM }] : [];
  const pagina3: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'testo', s: 'Calcolo GUIDE CABINA durante l\'intervento del paracadute', b: true },
    { t: 'sez', l: 'Verifica a carico di punta', righe: [
      valore('Fv = [ K1 gN  [ P + Q + Pcp + Maux  ] /  n ] + [Mg gn] + Fp', 'Fk', fmt(k.Fk, 1), 'N'),
      valore('σk = Fv ω / A', 'σk', fmt(k.sk, 1), 'N/mm2'), ...omegaNo,
    ] },
    { t: 'sez', l: 'Sollecitazione di flessione asse Y', righe: [
      valore('Fx = K1 gN  [ Q  XQ + P  Xc ] / (n x h)', 'Fx', fmt(k.Fx, 1), 'N'), valore('My = 3 Fx l / 16', 'My', fmt(k.My, 1), 'Nmm'),
      valore('σy = My / Wy', 'σy', fmt(k.sy, 1), 'N/mm2'),
    ] },
    { t: 'sez', l: 'Sollecitazione di flessione asse X', righe: [
      valore('Fy = K1 gN  [ Q  YQ + P Yc ] / ( n/2  h)', 'Fy', fmt(k.Fy, 1), 'N'), valore('Mx = 3  Fy l / 16', 'Mx', fmt(k.Mx, 1), 'Nmm'),
      valore('σx = Mx / Wx', 'σx', fmt(k.sx, 1), 'N/mm2'),
    ] },
    freccia('paracadute', k),
    { t: 'sez', l: 'RIEPILOGO VERIFICHE', righe: [
      chk('σm = σx + σy  ≤  σperm', 'σm', k.sm, 1, 'guideCabina.paracadute.sm', `≤ ${gear}`),
      chk('σ = σm + Fk  / A', 'σ', k.s, 1, 'guideCabina.paracadute.s', `≤ ${gear}`),
      chk('σc = σk + 0,9  σm ≤  σperm', 'σc', k.sc, 1, 'guideCabina.paracadute.sc', `≤ ${gear}`),
      chk('σf = 1,85  Fx / c2', 'σf', k.sf, 1, 'guideCabina.paracadute.sf', `≤ ${gear}`),
    ] },
    { t: 'testo', s: 'Calcolo GUIDE CABINA durante la fase di carico', b: true },
    { t: 'sez', l: '', righe: [valore(c.fsTesto, 'Fs', fmt(l.Fs, 0), 'N'), valore('', 'Xi', fmt(g.Xi, 0), 'mm'), valore('', 'Yi', fmt(g.Yi, 0), 'mm')] },
    { t: 'sez', l: 'Sollecitazione di flessione asse Y', righe: [
      valore('Fx = [ gN P (Xc - Xs) + Fs (Xi - Xs)] / (n x h)', 'Fx', fmt(l.Fx, 2), 'N'), valore('My = 3 Fx l / 16', 'My', fmt(l.My, 2), 'Nmm'),
      valore('σy = My / Wy', 'σy', fmt(l.sy, 2), 'N/mm2'),
    ] },
    { t: 'sez', l: 'Sollecitazione di flessione asse X', righe: [
      valore('FY = [ gN P (Yp - Ys) + Fs (Yi - Ys)] / (n/2 h)', 'Fy', fmt(l.Fy, 2), 'N'), valore('Mx = 3 Fy l / 16', 'Mx', fmt(l.Mx, 2), 'Nmm'),
      valore('σx = Mx / Wx', 'σx', fmt(l.sx, 2), 'N/mm2'),
      chk('σm = σx + σy  ≤  σperm', 'σm', l.sm, 2, 'guideCabina.carico.sm', `≤ ${run}`),
      chk('σf = 1,85 Fx / c2', 'σf', l.sf, 2, 'guideCabina.carico.sf', `≤ ${run}`),
    ] },
    freccia('carico', l),
    ...righeCorrezioni(e.verifiche.filter((v) => v.id === 'guideCabina.carico.s' || v.id.startsWith('guideCabina.carico2.') || v.id === 'guideCabina.tipoParacadute')),
  ];
  return [...pagina1, ...pagina2, ...pagina3];
}
