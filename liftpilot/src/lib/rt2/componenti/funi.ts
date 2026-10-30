// «Funi di trazione» of the RT after the owner's model (sheet «Funi», two pages): the ropes, the loads, the tension,
// D/d, the terminations, the compensation; then the stability against slipping (D.1) and the specific pressure (D.2).
// The numbers are the calculation's (funi-calc.ts: the ropes, the sheave, the groove, the wrap angle, the compensation
// as the calculator asks them for a modification); the page asks only what a rope entered by hand needs for its
// description (strands, construction, grade, section). The texts are the model's, verbatim where it states a fact
// LiftPilot checks; where it would state one that does not hold (existing ropes kept) our own. Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { fmt, mancantiCampi, num, str } from '../campi';
import { funiDaCalcolo } from '../funi-calc';
import { verificheFuni } from '../funi-verifiche';
import { nomeFune } from '../cataloghi/funi';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx, VerificaRt2 } from '../types';
import { righeCorrezioni, valore } from './righe';

const aMano = (ctx: ContestoRt2): boolean => funiDaCalcolo(ctx.calc.V)?.fune == null;

const CAMPI: readonly CampoRt2[] = [
  { id: 'g_fune', t: 'gruppo', label: 'Fune inserita a mano nel Calcolo argano', show: (_x, ctx) => aMano(ctx) },
  { id: 'trefoli', t: 'num', label: 'Numero trefoli:', min: 3, max: 12, step: 1, int: true, show: (_x, ctx) => aMano(ctx) },
  { id: 'formazione', t: 'testo', label: 'Formazione:', max: 60, show: (_x, ctx) => aMano(ctx) },
  { id: 'classe', t: 'testo', label: 'Classe resistenza:', max: 30, show: (_x, ctx) => aMano(ctx) },
  { id: 'sezione', t: 'num', label: 'Sezione:', unit: 'mm2', min: 5, max: 500, step: 0.1, show: (_x, ctx) => aMano(ctx) },
];

const GOLA: Readonly<Record<string, string>> = {
  VH: 'cuneo', VN: 'cuneo con intaglio', U: 'semicircolare senza intaglio', UU: 'semicircolare con intaglio',
};

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const f = funiDaCalcolo(ctx.calc.V);
  if (!f) return { verifiche: [], mancanti: [...mancantiCampi(CAMPI, x, ctx), 'calcolo.funi'], valori: {}, avvisi: [] };
  const o = f.out, verifiche = verificheFuni(f.input, o, ctx.calc.V, ctx.calc.res, ctx.norma, ctx.carico?.rapporto ?? false);
  const S = f.fune?.S ?? num(x, 'sezione');
  return {
    verifiche, mancanti: mancantiCampi(CAMPI, x, ctx), avvisi: [],
    valori: {
      n: f.input.n, d: f.input.d, MBL: f.input.MBL, S, ropeMass: o.ropeMass, Ctot: o.Ctot, Cfune: o.Cfune, sigma: S ? o.Cfune / S : null, z: o.z,
      dRatio: o.dRatio, T1: o.T1, T2: o.T2, T2p: o.T2p, T1p: o.T1p, a: o.a, C1: o.C1, C2: o.C2, f: o.f, efa: o.efa, ratioLow: o.ratioLow,
      ratioHigh: o.ratioHigh, vRope: o.vRope, Tstat: o.Tstat, pRes: o.pRes, pLim: o.pLim,
    },
  };
}

const esitoDi = (vs: readonly VerificaRt2[], id: string): VerificaRt2['esito'] | undefined => vs.find((v) => v.id === id)?.esito;

function pagine(ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const f = funiDaCalcolo(ctx.calc.V);
  if (!f) return [];
  const { input: i, out: o, fune } = f, vs = e.verifiche, es = (id: string) => esitoDi(vs, id);
  const S = fune?.S ?? num(x, 'sezione');
  const descr: FRiga[] = ctx.funiSostituite
    ? [{ t: 'testo', s: 'Le funi di trazioni installate sono conformi alla norma UNI EN 12385' },
      { t: 'testo', s: 'Il calcolo delle funi viene realizzato considerando il carico di rottura delle' },
      { t: 'testo', s: 'funi indicato nella norma UNI EN 12385 per i diametri unificati.' }]
    : [{ t: 'testo', s: 'Le funi di trazione esistenti restano in opera: si verificano con i dati che seguono.' },
      { t: 'testo', s: 'Il calcolo delle funi viene realizzato considerando il carico di rottura delle' },
      { t: 'testo', s: 'funi indicato nella norma UNI EN 12385 per i diametri unificati.' }];
  const comp = i.comp, conComp = comp.tipo !== 'nessuna';
  const pagina1: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Funi di trazione:', righe: descr },
    { t: 'sez', l: 'Caratteristiche delle funi:', righe: [
      valore('Numero funi:', 'n:', fmt(i.n, 0), '', es('funi.numero')),
      valore('Diametro:', 'd:', fmt(i.d, 1), 'mm', es('funi.diametro')),
      valore('Numero trefoli:', '', fune ? fmt(fune.trefoli, 0) : fmt(num(x, 'trefoli'), 0)),
      valore('Formazione:', '', fune?.formazione ?? str(x, 'formazione') ?? '—'),
      valore('Classe resistenza fili:', '', fune?.classe ?? str(x, 'classe') ?? '—', 'N/mm2'),
      valore('Sezione fune:', 'S:', fmt(S, 1), 'mm2'),
      valore('Carico di rottura fune:', 'Rm:', fmt(i.MBL, 0), 'N'),
      ...(fune ? [{ t: 'testo' as const, s: `Fune ${nomeFune(fune)}` }] : []),
    ] },
    { t: 'sez', l: 'Carichi agenti:', righe: [
      valore('Portata impianto:', 'Q:', fmt(i.Q, 0), 'kg'), valore('Massa totale cabina:', 'P:', fmt(i.P, 0), 'kg'),
      valore('Massa totale contrappeso:', 'Mcwt:', fmt(i.Mcw, 0), 'kg'), valore('Massa totale delle funi:', 'Mfuni:', fmt(o.ropeMass, 2), 'kg'),
    ] },
    { t: 'sez', l: 'Verifica a tensione:', righe: [
      valore('Carico totale sulle funi:', 'Ctot:', fmt(o.Ctot, 2), 'N'), valore('Carico su ogni fune:', 'Cfune:', fmt(o.Cfune, 2), 'N'),
      valore('Sollecitazione su ogni fune:', 'σfune:', fmt(S ? o.Cfune / S : null, 2), 'N/mm2'),
      valore('Coefficiente di sicurezza:', 'z:', fmt(o.z, 2), `≥ ${fmt(o.zMin, 0)}`, es('funi.z')),
    ] },
    { t: 'sez', l: 'Verifica rapporto diametri:\n(puleggia di trazione / fune)', righe: [
      valore('Diametro puleggia:', 'D:', fmt(i.D, 0), 'mm'), valore('Rapporto diametri:', 'D/d:', fmt(o.dRatio, 2), '≥ 40', es('funi.Dd')),
    ] },
    { t: 'sez', l: 'Attacchi delle funi:', righe: [
      { t: 'testo', s: `Il collegamento tra fune e attacco è realizzato in conformità a quanto indicato dalla norma ${p.norma}.` },
      { t: 'testo', s: 'Esso ha una resistenza non minore dell\' 80% del carico di rottura della fune.' },
    ] },
    { t: 'sez', l: 'Sistema di compensazione:', righe: [
      valore('Tipo di sistema:', '', comp.tipo === 'funi' ? 'Funi' : comp.tipo === 'catene' ? 'Catene' : 'Nessuna'),
      valore('Diametro funi/maglia:', 'dcomp:', fmt(conComp ? comp.d : 0, 1), 'mm'), valore('Numero funi/catene:', 'Ncomp:', fmt(comp.n, 0)),
      valore('Massa lineare:', 'mcomp:', fmt(conComp ? comp.q : 0, 2), 'kg/m'), valore('Massa compensazione:', 'Mcomp:', fmt(o.compMassCwt, 2), 'kg'),
      valore('Diametro puleggia tenditore:', 'Dcomp:', fmt(comp.Dt, 0), 'mm'),
      valore('Rapporto diametri:', '(D/d)comp =', o.compRatio === null ? 'n.d.' : fmt(o.compRatio, 2), o.compRatio === null ? '' : '≥ 30', es('funi.compDd')),
    ] },
  ];
  const golaV = i.gola.type === 'VH' || i.gola.type === 'VN', ang = golaV ? i.gola.gamma : i.gola.type === 'U' ? 0 : i.gola.beta;
  const pagina2: FBlock[] = [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Stabilità allo scorrimento:', righe: [
      { t: 'testo', s: 'Si considerano le tensioni statiche ai due lati della puleggia di trazione,' },
      { t: 'testo', s: 'considerando i pesi propri delle funi portanti e delle eventuali funi o catene di' },
      { t: 'testo', s: 'compensazione e la massa del loro tenditore.' },
    ] },
    { t: 'sez', l: 'Cabina in BASSO con sovraccarico', righe: [
      valore('Tensione lato cabina', 'T1:', fmt(o.T1, 2), 'N'), valore('Tensione lato contrappeso:', 'T2:', fmt(o.T2, 2), 'N'),
    ] },
    { t: 'sez', l: 'Cabina in ALTO senza carico', righe: [
      valore('Tensione lato cabina', 'T\'2:', fmt(o.T2p, 2), 'N'), valore('Tensione lato contrappeso:', 'T\'1:', fmt(o.T1p, 2), 'N'),
    ] },
    { t: 'sez', l: '', righe: [
      valore('Decelerazione', 'a:', fmt(o.a, 2), 'm/s2'), valore('Coefficiente', 'C1:', fmt(o.C1, 2)), valore('Coefficiente C2:', 'C2:', fmt(o.C2, 2)),
      valore('Tipo gola:', '', GOLA[i.gola.type] ?? '—'),
      valore('Angolo gola:', golaV ? 'γ:' : 'β:', fmt((ang * Math.PI) / 180, 2), 'rad'), valore('', '', fmt(ang, 1), '°'),
      valore('Angolo avvolgimento:', 'α:', fmt(o.alfaRad, 2), 'rad'), valore('', '', fmt(i.alfa, 1), '°'),
      valore('Coefficiente di attrito:', 'μ:', '0,09'),
      valore('Rapp. tensioni (basso):', '(T1/T2) x C1C2 =', fmt(o.ratioLow, 2), '', es('funi.d1Basso')),
      valore('Rapp. tensioni (alto):', '(T\'1/T\'2) x C1C2 =', fmt(o.ratioHigh, 2), '', es('funi.d1Alto')),
      valore('Coefficiente f:', 'f =', fmt(o.f, 3)), valore('Rapp. Tensioni limite:', 'e^(fα) =', fmt(o.efa, 2)),
    ] },
    { t: 'sez', l: 'Pressione specifica:', righe: [
      valore('Numero funi:', 'n:', fmt(i.n, 0)), valore('Diametro funi:', 'd:', fmt(i.d, 1), 'mm'), valore('Velocità funi:', 'vf:', fmt(o.vRope, 2), 'm/s'),
      valore('Diametro puleggia:', 'D:', fmt(i.D, 0), 'mm'), valore('Carico statico massimo:', 'T :', fmt(o.Tstat, 2), 'N'),
      valore('Pressione specifica risultante', 'pris =', fmt(o.pRes, 2), 'N/mm2', es('funi.d2')),
      { t: 'testo', s: 'essendo:' },
      { t: 'testo', s: 'pris = (4,5 x T) / [ ndD x sin (γ / 2)]   gole a cuneo' },
      { t: 'testo', s: 'pris = [8 x T x cos(β/2)] / [(ndD x ( π - β - sinβ)]   gole semicircolari' },
      valore('Pressione specifica limite', 'plim =', fmt(o.pLim, 2), 'N/mm2'),
      { t: 'testo', s: 'essendo:' }, { t: 'testo', s: 'plim = 0,981 x (12,5 + 4vf) / (1 + vf)' },
    ] },
    ...righeCorrezioni(vs.filter((v) => v.id === 'funi.sf' || v.id.startsWith('funi.tr_') || v.id === 'funi.gamma' || v.id === 'funi.beta')),
  ];
  return [...pagina1, ...pagina2];
}

export const FUNI: ModuloRt2 = { id: 'funi', titolo: 'Funi di trazione', campi: CAMPI, calcola, pagine };
