// «Macchina» of the RT after the owner's model (sheet «Macchina», one page): the machine, its ratio, the suspension, the
// motor, the traction sheave, the declaration on the structures, the rated speed before and after. The numbers are the
// calculation's (the new machine: its ratio, sheave, motor speed and power, poles, groove; the rated speed); the speed
// the motor gives — n·π·D/(i·60000·r) with one or two speeds, the rpm and the frequency for the rated speed with VVVF — is
// the model's formula. Its corrections: the change of the speed measured as UNI 10411-1 15.1 measures it (the higher of
// the logbook's and the one after 50 Hz, more than 5 % above: an increase; UNI 10411-11: any change) instead of ±5 % from
// the speed before (E-M2); the inverter's note when the motor at 50 Hz would change the speed by more than 5 % and the
// rated speed stays within it (E-M1); the frequency from the motor's poles (E-M9); the brake of a new machine to UNI EN
// 81-20 5.9.2, which the calculation checks (E-M5); the declaration on the structures only without an increase of the
// loads beyond prospetto 1 — with one, the declaration of the building's fitness is among the attachments. Pure.
import { readInputs } from '@/calc/inputs';
import type { Check, CheckId } from '@/calc/types';
import type { FBlock, FRiga } from '../../report/rt2/model';
import { fmt, verifica } from '../campi';
import { rifCalcolo } from '../rif-calcolo';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx, VerificaRt2 } from '../types';
import { righeCorrezioni, valore } from './righe';

const CAMPI: readonly CampoRt2[] = [];
const GOLA: Readonly<Record<string, string>> = {
  VH: 'cuneo', VN: 'cuneo con intaglio', U: 'semicircolari senza intaglio', UU: 'semicircolari con intaglio',
};
const SOSP: Readonly<Record<number, string>> = { 1: 'Diretto', 2: 'Indiretto 1:2', 4: 'Indiretto 1:4' };
const FRENO: readonly { id: CheckId; testo: string }[] = [
  { id: 'b_sets', testo: 'Freno: numero dei gruppi' }, { id: 'b_all', testo: 'Freno: tutti i gruppi, 1,25·Q in discesa' },
  { id: 'b_one', testo: 'Freno: un gruppo, portata in discesa' }, { id: 'b_up', testo: 'Freno: un gruppo, cabina vuota in salita' },
  { id: 'b_amax', testo: 'Freno: decelerazione massima' },
];

export interface Velocita {
  /** the speed the motor gives at its rated rpm (one or two speeds), the rated speed after, the one before [m/s] */
  vMotore: number | null;
  vNuova: number | null;
  vPrima: number | null;
  /** with VVVF: the motor's rpm and the frequency for the rated speed */
  nVvvf: number | null;
  fVvvf: number | null;
}

export function velocitaMacchina(ctx: ContestoRt2): Velocita {
  const { N, bad } = readInputs(ctx.calc.V), r = ctx.dopo.r ?? 1;
  const ok = !['n_D', 'n_i', 'n_nm'].some((id) => bad.includes(id)) && N.i > 0 && N.D > 0;
  const vMotore = ok ? (N.nm * Math.PI * N.D) / (N.i * 60000 * r) : null;
  const vvvf = ctx.dopo.azionamento === 'vvvf';
  const vNuova = vvvf ? ctx.dopo.v : vMotore ?? ctx.dopo.v;
  const nVvvf = vvvf && ok && vNuova !== null ? (vNuova * N.i * 60000 * r) / (Math.PI * N.D) : null;
  return { vMotore, vNuova, vPrima: ctx.prima.v ?? null, nVvvf, fVvvf: nVvvf !== null ? (N.poles * nVvvf) / 120 : null };
}

/** The inverter's note (the model's B120:D122, also on the first page C183:C185; corrected E-M1): with VVVF, the motor at
 *  50 Hz would move the speed more than 5 % from the one before while the rated speed stays within 5 % of it. */
export function notaInverter(ctx: ContestoRt2): boolean {
  const s = velocitaMacchina(ctx), rif = s.vPrima;
  return ctx.dopo.azionamento === 'vvvf' && !!rif && s.vMotore !== null && s.vNuova !== null
    && Math.abs(s.vMotore - rif) / rif > 0.05 && Math.abs(s.vNuova - rif) / rif <= 0.05;
}

function calcola(ctx: ContestoRt2): EsitoRt2 {
  const s = velocitaMacchina(ctx), vel = ctx.velocita, verifiche: VerificaRt2[] = [];
  if (vel) {
    const lim = ctx.norma === '10411-1' ? 0.05 : 0;
    verifiche.push(verifica('macchina.velocita', 'Variazione della velocità nominale', vel.dv * 100, '<=', lim * 100, {
      unita: '%', dec: 2, info: true, rif: ctx.norma === '10411-1' ? 'UNI 10411-1:2024, 15.1 e 15.16' : 'UNI 10411-11:2024, 15',
    }));
  }
  if (ctx.parti.includes('machine')) {
    const ck = (id: CheckId): Check | undefined => ctx.calc.res?.checks.find((c) => c.id === id);
    for (const f of FRENO) {
      const c = ck(f.id);
      if (!c || c.status === 'info') continue;
      verifiche.push({ id: `macchina.${f.id}`, testo: f.testo, valore: c.value, limite: c.limit, confronto: f.id === 'b_amax' ? '<=' : '>=', unita: '', dec: c.dec,
        esito: c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'fail', rif: rifCalcolo(f.id, ctx.calc.V, ctx.norma) });
    }
  }
  const mancanti = s.vNuova === null ? ['calcolo.macchina'] : [];
  return { verifiche, mancanti, avvisi: [], valori: { vMotore: s.vMotore, vNuova: s.vNuova, vPrima: s.vPrima, nVvvf: s.nVvvf, fVvvf: s.fVvvf } };
}

/** «1  :» and the denominator as the model writes the ratio (2 : 2i when i is a half). */
function rapporto(i: number): [string, string] {
  if (Number.isInteger(i)) return ['1  :', fmt(i, 0)];
  return Number.isInteger(i * 2) ? ['2  :', fmt(i * 2, 0)] : ['1  :', fmt(i, 2)];
}

function testiVelocita(ctx: ContestoRt2): string[] {
  const vel = ctx.velocita, par = ctx.norma === '10411-1' ? 'norma UNI 10411-1 : 2024' : 'norma UNI 10411-11 : 2024';
  if (!vel || vel.uguale) return ['La nuova velocità di esercizio risulta essere uguale a ', 'quella preesistente.'];
  if (vel.aumento || (ctx.norma === '10411-11' && vel.variata)) {
    return ['La nuova velocità di esercizio risulta essere ' + (vel.dv > 0 ? 'superiore ' : 'inferiore '),
      ctx.norma === '10411-1' ? 'alla precedente di più del 5%. Per cui devono essere' : 'alla precedente. Per cui devono essere',
      `rispettate le condizioni indicate nella ${par}`, 'al paragrafo 15'];
  }
  return ['La nuova velocità di esercizio risulta essere inferiore', 'alla precedente aumentata del 5%. Per cui non è',
    'necessario ottemperare alle condizioni indicate nella', `${par}, paragrafo 15`];
}

function pagine(ctx: ContestoRt2, _x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const { N } = readInputs(ctx.calc.V), nuova = ctx.parti.includes('machine'), s = velocitaMacchina(ctx), vvvf = ctx.dopo.azionamento === 'vvvf';
  const [num, den] = rapporto(N.i), model = String(ctx.calc.V.n_model ?? '').trim();
  const pre = (x: string): string => (nuova ? x : 'preesistente');
  const argano: FRiga[] = nuova
    ? [{ t: 'testo', s: 'Argano del tipo a vite senza fine e corona elicoidale, con giunto rigido e ' }, { t: 'testo', s: 'freno elettromagnetico' },
      ...(model ? [{ t: 'testo' as const, s: `Modello: ${model}` }] : [])]
    : [{ t: 'testo', s: 'preesistente' }];
  const golaV = N.groove.type === 'VH' || N.groove.type === 'VN', ang = golaV ? N.groove.gamma : N.groove.type === 'U' ? 0 : N.groove.beta;
  const strutture: FRiga[] = ctx.carico?.p1
    ? [{ t: 'testo', s: 'Le modifiche apportate aumentano i carichi oltre il prospetto 1 della norma: si allega la' },
      { t: 'testo', s: 'dichiarazione di idoneità statica delle strutture portanti dell\'edificio.' }]
    : p.idoneitaAllegata
    ? [{ t: 'testo', s: 'Le modifiche apportate variano i carichi sulle strutture portanti dell\'edificio: si allega la' },
      { t: 'testo', s: 'dichiarazione di idoneità statica delle strutture portanti dell\'edificio.' }]
    : [{ t: 'testo', s: 'Si dichiara che le modifiche apportate all\'impianto preesistente ' }, { t: 'testo', s: 'sono ritenute non significative a sfavore della sicurezza e ' },
      { t: 'testo', s: 'integrità nei loro punti di applicazione' }];
  const nota = notaInverter(ctx);
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Argano:', righe: [...argano, valore('Rapporto di riduzione:', 'τ:', pre(num), pre(den)), valore('Sospensione impianto:', '', SOSP[ctx.dopo.r ?? 1] ?? '—')] },
    { t: 'sez', l: 'Motore sollevamento:', righe: [
      valore('Giri motore', '', vvvf ? fmt(s.nVvvf !== null ? Math.round(s.nVvvf / 10) * 10 : null, 0) : fmt(N.nm, 0), 'rpm'),
      valore('Potenza motore:', '', nuova ? fmt(N.Pn, 1) : 'preesistente', 'kW'),
      valore('Frequenza', '', vvvf ? fmt(s.fVvvf, 0) : '50', 'Hz'),
    ] },
    { t: 'sez', l: 'Puleggia di trazione:', righe: [
      valore('Diametro puleggia:', 'D:', fmt(N.D, 0), 'mm'), valore('Diam. funi trazione:', 'd:', fmt(N.d, 1), 'mm'),
      valore('Numero gole:', '', fmt(N.n, 0)), valore('Angolo gole:', golaV ? 'γ:' : 'β:', fmt(ang, 1), '°'),
      valore('Profilo gole:', '', nuova ? GOLA[N.groove.type] ?? '—' : 'preesistente'),
    ] },
    { t: 'sez', l: 'Strutture portanti:', righe: strutture },
    { t: 'sez', l: 'Velocità di esercizio:', righe: [
      valore('La velocità di esercizio preesistente era di:', '', fmt(s.vPrima ?? s.vNuova, 2), 'm/s'),
      valore('La velocità dopo la modifica apportata è:', '', fmt(s.vNuova, 2), 'm/s'),
      ...testiVelocita(ctx).map((t): FRiga => ({ t: 'testo', s: t })),
      ...(nota ? [{ t: 'testo' as const, s: 'ATTENZIONE :', b: true }, { t: 'testo' as const, s: 'La velocità dell\'impianto viene riportata al valore originale' },
        { t: 'testo' as const, s: 'attraverso la regolazione del dispositivo inverter VVVF' }, { t: 'testo' as const, s: 'a frequenza variabile.' }] : []),
    ] },
    ...righeCorrezioni(e.verifiche.filter((v) => v.id.startsWith('macchina.b_'))),
  ];
}

export const MACCHINA: ModuloRt2 = { id: 'macchina', titolo: 'Macchina', campi: CAMPI, calcola, pagine };
