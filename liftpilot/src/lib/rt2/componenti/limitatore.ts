// «Limitatore di velocità» of the RT after the owner's model (sheet «Limitatore», one page): the governor and its
// electrical contact, its rope (diameter, strands, construction, the governor's tensile force, the breaking load, the
// safety factor, the sheave over the rope), the tripping speed's limits for the car's safety gear and the rule at the
// installation's date. The model's lists and its «altro» inputs; the rated speed is the context's; the car's safety gear
// is the field shared with «Cabina»; added (the model did not ask them): the plate tripping speed (E-L7) and the force
// that makes the gear engage (E-L2), and under UNI 10411-1 with a new governor or the speed reduced the limit of the
// rule at the installation with its source (18, 15.17; round 52). A governor that stays is described as existing, not
// certified as installed to UNI EN 81-20 (E-L13). Pure.
import { KV_GOV } from '@/shaft/norme-limitatore';
import type { FBlock, FRiga } from '../../report/rt2/model';
import { KR } from '../../rt/norme';
import { fmt, mancantiCampi, num, str } from '../campi';
import { FUNE_ALTRA, FUNI_LIMITATORE, LIMITATORE_ALTRO, LIMITATORI } from '../cataloghi/cqpl';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx } from '../types';
import { avvisiParacadute, campoParacadute, paracaduteDi } from './cabina-paracadute';
import { limitatoreDi, limitatoreRichiesto, origineRichiesta, verificheLimitatore } from './limitatore-calcolo';
import { valore } from './righe';

const altro = (x: DatiRt2): boolean => x.tipo === LIMITATORE_ALTRO.v;
const altraFune = (x: DatiRt2): boolean => x.fune === FUNE_ALTRA.v;
const richiesto = (_x: DatiRt2, ctx: ContestoRt2): boolean => limitatoreRichiesto(ctx);
const origine = (_x: DatiRt2, ctx: ContestoRt2): boolean => origineRichiesta(ctx);

const CAMPI: readonly CampoRt2[] = [
  { id: 'tipo', t: 'scelta', label: '90. Tipo di limitatore:', req: true, opzioni: [...LIMITATORI, LIMITATORE_ALTRO].map((g) => ({ v: g.v, t: g.t })) },
  { id: 'g_altro', t: 'gruppo', label: 'Inserire i seguenti dati del limitatore', show: altro },
  { id: 'altroForza', t: 'num', label: 'Forza azionamento paracadute:', unit: 'N', min: 100, max: 20000, step: 1, req: true, show: altro },
  { id: 'altroDiametro', t: 'num', label: 'Diametro minimo di avvolgimento:', unit: 'mm', min: 50, max: 1000, step: 1, req: true, show: altro },
  { id: 'fune', t: 'scelta', label: '91. Diametro fune azionamento:', req: true, opzioni: [...FUNI_LIMITATORE, FUNE_ALTRA].map((f) => ({ v: f.v, t: f.t })) },
  { id: 'g_fune', t: 'gruppo', label: 'Inserire i seguenti dati della fune del limitatore:', show: altraFune },
  { id: 'funeDiametro', t: 'num', label: 'Diametro:', unit: 'mm', min: 3, max: 20, step: 0.1, req: true, show: altraFune },
  { id: 'funeTrefoli', t: 'num', label: 'Trefoli:', min: 3, max: 12, step: 1, int: true, req: true, show: altraFune },
  { id: 'funeFormazione', t: 'testo', label: 'Formazione:', max: 60, req: true, show: altraFune },
  { id: 'funeRottura', t: 'num', label: 'Carico di rottura:', unit: 'N', min: 1000, max: 200000, step: 10, req: true, show: altraFune },
  { id: 'g_intervento', t: 'gruppo', label: 'Intervento del limitatore e paracadute' },
  campoParacadute(true),
  { id: 'vScatto', t: 'num', label: 'Velocità d\'intervento del limitatore (targa):', unit: 'm/s', min: 0.1, max: 12, step: 0.01, req: richiesto },
  { id: 'forzaPresa', t: 'num', label: 'Forza necessaria a far intervenire il paracadute:', unit: 'N', min: 10, max: 20000, step: 1, req: richiesto },
  // the rule at the installation (UNI 10411-1:2024 18 and 15.17, note 9): its limit with its source, the engineer's
  { id: 'g_origine', t: 'gruppo', label: 'Regola in vigore alla data di installazione', show: origine },
  { id: 'limiteOrigine', t: 'num', label: 'Velocità d\'intervento massima della regola all\'installazione:', unit: 'm/s', min: 0.1, max: 12, step: 0.01, req: true, show: origine },
  { id: 'fonteOrigine', t: 'testo', label: 'Regola e punto da cui è preso il limite:', max: 120, req: true, show: origine },
];

/** The model's defaults (Limitatore!S72 = 1, S88 = 5). */
const proposte = (): DatiRt2 => ({ tipo: '1', fune: '5' });

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const p = paracaduteDi(x), o = limitatoreDi(ctx, x, p), verifiche = verificheLimitatore(ctx, x, o, p);
  const avvisi = [...avvisiParacadute(p, o.v)];
  // the model's B27: no tripping speed admissible for this gear at this rated speed
  if (o.vMin !== null && o.vMax !== null && o.vMin >= o.vMax - 1e-9) avvisi.push('ATTENZIONE, VELOCITA\' NON VERIFICATA, CONTROLLARE PARACADUTE');
  return {
    verifiche, avvisi, mancanti: [...mancantiCampi(CAMPI, x, ctx), ...(o.v === null ? ['calcolo.velocita'] : [])],
    valori: {
      tipo: o.tipo, d: o.d, trefoli: o.trefoli, formazione: o.formazione, Fad: o.Fad, FRm: o.FRm, x: o.x, Dmin: o.Dmin, Dpul: o.Dpul, rapportoD: o.rapportoD,
      v: o.v, vMin: o.vMin, vMaxModello: o.vMaxModello, vMax: o.vMax, vScatto: num(x, 'vScatto'), forzaPresa: num(x, 'forzaPresa'), paracadute: p?.t ?? null,
    },
  };
}

const T = (s: string): FRiga => ({ t: 'testo', s });

function pagine(ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const par = paracaduteDi(x), o = limitatoreDi(ctx, x, par), es = (id: string) => e.verifiche.find((v) => v.id === id)?.esito;
  const nuovo = ctx.parti.includes('governor'), dm587 = ctx.regime === 'dm_587_1987', dd = o.d !== null && !Number.isInteger(o.d) ? 1 : 0;
  const forza = e.verifiche.find((v) => v.id === 'limitatore.forza')?.limite ?? null, w = e.verifiche.find((v) => v.id === 'limitatore.scatto');
  const descr = nuovo
    ? ['Il dispositivo limitatore di velocità installato risulta conforme a quanto indicato', 'dalla normativa vigente UNI EN 81.20 : 2020 ed è completo di dispositivo ',
      'contatto elettrico conforme al punto 5.6.2.2.1.6 che comanda l\'arresto del ', 'macchinario prima che la velocità della cabina raggiunga la velocità di ',
      'intervento del limitatore.', 'Tuttavia, per velocità nominali che non superino 1 m/sec, questo dispositivo',
      'può agire al più tardi quando si raggiunge la velocità di intervento del', 'limitatore di velocità.']
    : ['Il dispositivo limitatore di velocità esistente resta in opera: i dati della sua fune e le verifiche', 'sono riportati di seguito.'];
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Limitatore di velocità:', righe: descr.map(T) },
    { t: 'sez', l: 'Fune di azionamento:', righe: [
      valore('Diametro fune:', 'd:', fmt(o.d, dd), 'mm', es('limitatore.funeDiametro')),
      valore('Trefoli:', '', fmt(o.trefoli, 0)), valore('Formazione:', '', o.formazione ?? '—'),
      valore('Costruzione:', '', o.altraFune ? '—' : 'Preformata'),
      valore('Forza di trazione:', 'Fad:', fmt(o.Fad, 0), forza !== null ? `N   ≥ ${fmt(forza, 0)} N` : 'N', es('limitatore.forza')),
      valore('Carico di rottura fune:', 'FRm:', fmt(o.FRm, 0), 'N'),
      valore('Coefficiente di sicurezza:', 'x  = FRm/Fad:', fmt(o.x, 1), `≥ ${KR.govRopeSf}`, es('limitatore.funeSicurezza')),
      valore('Diametro minimo avvolgimento:', 'Dmin:', fmt(o.Dmin, 0), 'mm'),
      valore('Diametro puleggia limitatore:', 'D:', fmt(o.Dpul, 0), 'mm'),
      // the model's J81 (AU10): its text by the ratio itself, the outcome beside it
      valore('Rapporto diametri:', 'D/d:', fmt(o.rapportoD, 2), o.rapportoD !== null && o.rapportoD >= KV_GOV.govSheaveRatio - 1e-9 ? '=> 30'
        : 'NO, diametro carrucola non corretto', es('limitatore.Dd')),
    ] },
    { t: 'sez', l: 'Velocità di intervento:', righe: [
      valore('Velocità Nominale impianto:', '', fmt(o.v, 2), 'm/sec'),
      valore('Velocità minima d\'intervento (115% vel. nom.)', '', fmt(o.vMin, 2), 'm/sec'),
      valore('(*) Velocità intervento limitatore', '', fmt(o.vMax, 2), 'm/sec max'),
      ...(dm587 ? [T('rispetto al paragrafo 5.6.2.2.1.1 punti a) b) c) d)'), T('della norma UNI EN 81.20 : 2020')] : [T('UNI EN 81.20 : 2020 punto 5.6.2.2.1.1')]),
      valore('Velocità d\'intervento del limitatore (targa):', '', fmt(num(x, 'vScatto'), 2), 'm/sec', w?.esito),
      valore('Tipo Paracadute:', '', par?.t ?? '—'),
      ...(origineRichiesta(ctx) ? [valore('Limite della regola all\'installazione:', '', fmt(num(x, 'limiteOrigine'), 2), 'm/sec max', es('limitatore.origine')),
        T(`(${str(x, 'fonteOrigine') ?? '—'})`)] : []),
    ] },
    { t: 'sez', l: '', righe: [
      T('Il limitatore di velocità è considerato un componente di sicurezza e  deve'), T('essere verificato in conformità ai requisiti della norma'),
      T('UNI EN 81.50 : 2020 punto 5.4'), T('Questo dispositivo deve assicurare l\'intervento del paracadute nei limiti'),
      T('prescritti dalla normativa vigente alla data di installazione dell\'impianto. (*)'),
      ...(nuovo ? [T('Si allega dichiarazione CE di conformità del tipo per il limitatore di velocità '), T('installato.')] : []),
    ] },
    { t: 'testo', s: '(*) Precedentemente alla UNI EN 81.1 : 1999 si applicavano, in ordine temporale, il Decreto Luogoten.le 31 agosto 1945 N° 600, ', nota: true },
    { t: 'testo', s: 'il Decreto del Presidente della Repubblica 29 maggio 1963 n. 1497 e il Decreto Ministeriale 9 dicembre 1987 n 587', nota: true },
  ];
}

export const LIMITATORE: ModuloRt2 = { id: 'limitatore', titolo: 'Limitatore di velocità', campi: CAMPI, proposte, calcola, pagine };
