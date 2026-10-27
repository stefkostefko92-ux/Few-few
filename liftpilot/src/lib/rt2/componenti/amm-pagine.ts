// The printed page of the buffers of a side (round 52), one page as the model's sheet of the type chosen prints it
// («Amm. a molla …» rows 47–106, «Amm. in autan …» 50–109, «Amm. idraulici …» 49–106): its texts verbatim, its values
// with its formats (General: no trailing zeros), the outcome of each check on its value's line. Our additions, listed
// among the corrections: the buffer's model (X5), the 65 mm and the ends of the 2,5–4 ratio as the check applies them
// (S1, S2), the unit of Fris (T3), the reduced stroke's floor (H2), the polyurethane buffer's data and every check the
// model leaves out (A1, H4, X3), in «Verifiche secondo la norma». The values are the result's (amm-esito.ts). Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { fmt } from '../campi';
import { K_AMM } from '../norme-amm';
import type { EsitoRt2, PaginaCtx, VerificaRt2 } from '../types';
import type { LatoAmm } from './amm-campi';
import { righeCorrezioni, valore } from './righe';

/** Excel's «General» as the model's cells print it: up to `dec` decimals, no trailing zeros. */
export const gen = (x: number | null | undefined, dec = 2): string => {
  const s = fmt(x, dec);
  return s.includes(',') ? s.replace(/0+$/, '').replace(/,$/, '') : s;
};

const n = (e: EsitoRt2, k: string): number | null => {
  const v = e.valori[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const s = (e: EsitoRt2, k: string): string | null => {
  const v = e.valori[k];
  return typeof v === 'string' && v !== '' ? v : null;
};
const testo = (t: string): FRiga => ({ t: 'testo', s: t });

function testa(l: LatoAmm, p: PaginaCtx, tipo: string, e: EsitoRt2): FBlock[] {
  const modello = s(e, 'modello');
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Ammortizzatori:', righe: [
      valore('Ammortizzatori installati sotto:', '', l.sotto), valore('Tipo:', '', tipo), ...(modello ? [valore('Modello:', '', modello)] : []),
    ] },
  ];
}

function molla(l: LatoAmm, e: EsitoRt2, p: PaginaCtx, es: (nome: string) => VerificaRt2 | undefined): FBlock[] {
  return [
    ...testa(l, p, 'ad elica cilindrica', e),
    { t: 'sez', l: '', righe: [
      valore('Carico statico totale:', 'Ftot:', gen(n(e, 'Ftot')), 'N'),
      valore('Numero ammortizzatori:', 'Na:', gen(n(e, 'Na'))),
      valore('Lunghezza:', 'L0:', gen(n(e, 'L0')), 'mm'),
      valore('Diametro medio elica:', 'D:', gen(n(e, 'D')), 'mm'),
      valore('Diametro del filo:', 'd:', gen(n(e, 'd')), 'mm'),
      valore('Passo:', 'p:', fmt(n(e, 'p'), 2), 'mm'),
      valore('Numero spire attive:', 'i:', fmt(n(e, 'i'), 1)),
      valore('Velocità discesa', 'vc:', fmt(n(e, 'vc'), 2), 'm/s'),
      valore('Freccia max ammortizzatore:', 'f = L-d*(1+1,1*n) :', fmt(n(e, 'f'), 1), 'mm', es('mollaCorsa')?.esito),
      valore('Freccia minima:', 'fmin = 135 v²:', fmt(n(e, 'fmin'), 2), 'mm'),
      testo('e comunque non minore di 65 mm'),
      valore('Modulo elasticità tangenziale:', 'G:', gen(n(e, 'G')), 'N/mm2'),
      testo('Carico assiale max ammissibile ammortizzatore'),
      testo('essendo:'),
      valore('', 'Fadm = ( f G d⁴ ) / ( 8 D³ i ):', fmt(n(e, 'Fadm'), 1), 'N'),
      valore('Carico statico sull\'ammortizzatore:', 'Fris = Ftot / Na:', gen(n(e, 'Fris')), 'N'),
      valore('Verifica carichi:', '2,5 ≤ Fadm/Fris ≤ 4:', fmt(n(e, 'rapporto'), 2), '', es('mollaCarichi')?.esito),
    ] },
    { t: 'sez', l: 'Nota per il calcolo:', righe: [
      testo('Gli ammortizzatori ad elica cilindrica sono calcolati secondo la norma'), testo('UNI EN 81.20 : 2020 - punto 5.8.2.1.1'),
    ] },
  ];
}

function autan(l: LatoAmm, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const F1 = n(e, 'F1');
  return [
    ...testa(l, p, 'ad accumulazione di energia con caratteristica non lineare', e),
    { t: 'testo', s: 'Caratteristiche ammortizzatori come da certificato allegato', b: true },
    { t: 'sez', l: '', righe: [
      valore('Numero ammortizzatori:', 'Na:', gen(n(e, 'Na'))),
      valore('Freccia massima:', 'f:', gen(n(e, 'f')), 'mm'),
      ...(F1 !== null ? [valore('Carico massimo linearizzato:', 'F1:', gen(F1), 'N')] : []),
      valore('Velocità nominale', 'v:', fmt(n(e, 'vc'), 2), 'm/s'),
    ] },
  ];
}

function idraulici(l: LatoAmm, e: EsitoRt2, p: PaginaCtx, es: (nome: string) => VerificaRt2 | undefined): FBlock[] {
  const ridotta = s(e, 'ridotta') === 'si', vc = n(e, 'vc');
  return [
    ...testa(l, p, 'a dissipazione di energia (idraulici)', e),
    { t: 'sez', l: '', righe: [
      valore('Carico statico totale:', 'Ftot:', gen(n(e, 'Ftot')), 'N'),
      valore('Numero ammortizzatori:', 'Na:', gen(n(e, 'Na'))),
      valore('Carico statico risultante sull\'ammortizzatore', 'Fris:', gen(n(e, 'Fris')), 'N'),
      valore('Max velocità discesa', 'vc:', fmt(vc, 2), 'm/s'),
      valore('Freccia max ammortizzatore:', 'f:', gen(n(e, 'f')), 'mm', es('idrCorsa')?.esito),
      valore('Sistema di rallentamento sull\'ammortizzatore:', '', s(e, 'rallentamento') ?? '—'),
      valore('Freccia minima:', 'fmin:', fmt(n(e, 'fmin'), 2), 'mm'),
      testo('essendo:'),
      valore('', 'fmin =', s(e, 'fminTesto') ?? '—'),
      ...(ridotta ? [valore('Velocità di contatto garantita:', 'vi:', fmt(n(e, 'vContatto'), 2), 'm/s'),
        testo(`e comunque non minore di ${K_AMM.ridottaMin} mm, né maggiore di 0,0674 x vc^2`)] : []),
    ] },
    { t: 'sez', l: 'Nota per il calcolo:', righe: [
      testo('Gli ammortizzatori a dissipazione di energia sono conformi alla'), testo('norma UNI EN 81.20 : 2020 - punto 5.8.2.2'),
    ] },
  ];
}

/** The page of the side's buffers; none while the type is not chosen. */
export function pagineAmm(l: LatoAmm, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const tipo = s(e, 'tipo'), es = (nome: string): VerificaRt2 | undefined => e.verifiche.find((v) => v.id === `${l.id}.${nome}`);
  const extra = (nomi: readonly string[]): FBlock[] => righeCorrezioni(e.verifiche.filter((v) => nomi.some((x) => v.id === `${l.id}.${x}`)));
  const masse = ['MassaVuota', 'MassaCarica', 'Massa'];
  if (tipo === 'molla') return [...molla(l, e, p, es), ...extra(['mollaVelocita'])];
  if (tipo === 'autan') return [...autan(l, e, p), ...extra(['autanVelocita', 'autanUrto', ...masse.map((m) => `autan${m}`)])];
  if (tipo === 'idraulici') {
    return [...idraulici(l, e, p, es), ...extra(['idrUrto', ...masse.map((m) => `idr${m}`)]),
      { t: 'testo', s: 'Si allega certificato di esame di tipo dell\'ammortizzatore in oggetto' }];
  }
  return [];
}
