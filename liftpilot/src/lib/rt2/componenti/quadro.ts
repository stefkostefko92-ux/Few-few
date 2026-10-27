// «Quadro di manovra» of the RT after the owner's model (sheet «Quadro Manovra », one page): the declaration on the new
// controller's compatibility with the existing electrical parts, the kind of control, the earthing, the circuits, their
// voltages and frequencies, their protection, the call inhibition, the lines and the diagrams. The model's inputs —
// the door operator's voltage and frequency shared with «Porte» under the same ids (one value: E-Q8) — and its texts;
// a controller that stays is not declared new (E-Q11). Added: the control and safety circuits' voltage of a new
// controller (UNI EN 81-20:2020, 5.10.1.3.2, E-Q9) and, under UNI 10411-1 with the existing landing doors kept, their
// locks' contacts (11.1.2, E-Q10) — the first RT's rules (KR). Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { KR } from '../../rt/norme';
import { bool, fmt, mancantiCampi, num, str, verifica } from '../campi';
import { FREQUENZE, TIPI_MANOVRA, voceDi } from '../cataloghi/cqpl';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx, VerificaRt2 } from '../types';
import { valore } from './righe';

const OPZ_FREQ = FREQUENZE.map((f) => ({ v: f.v, t: f.t }));

/** The door operator's voltage and frequency (the model's «36, 86» and «37, 87», asked on both pages): the same ids on
 *  «Quadro di manovra» and «Porte», each page with the model's label. */
export const campiOperatore = (tensione: string, frequenza: string, show?: (x: DatiRt2, ctx: ContestoRt2) => boolean): CampoRt2[] => [
  { id: 'tensioneOperatore', t: 'num', label: tensione, unit: 'V', min: 5, max: 500, step: 1, req: true, ...(show ? { show } : {}) },
  { id: 'frequenzaOperatore', t: 'scelta', label: frequenza, opzioni: OPZ_FREQ, req: true, ...(show ? { show } : {}) },
];
/** The model's defaults of the door operator ('Quadro Manovra '!F14, N25). */
export const PROPOSTE_OPERATORE: DatiRt2 = { tensioneOperatore: 230, frequenzaOperatore: '50' };

/** The existing landing locks' contacts are asked under UNI 10411-1 with a new controller and the landing doors kept. */
const contatti = (_x: DatiRt2, ctx: ContestoRt2): boolean =>
  ctx.norma === '10411-1' && ctx.parti.includes('controller') && !ctx.parti.includes('landingDoors');

const CAMPI: readonly CampoRt2[] = [
  { id: 'tipoManovra', t: 'scelta', label: '31. Tipo di manovra:', req: true, opzioni: TIPI_MANOVRA },
  { id: 'tensioneForzaMotrice', t: 'num', label: '32. Linea Forza Motrice:', unit: 'V', min: 100, max: 1000, step: 1, req: true },
  { id: 'tensioneLuce', t: 'num', label: '33. Linea Luce:', unit: 'V', min: 100, max: 500, step: 1, req: true },
  { id: 'tensioneManovra', t: 'num', label: '34. Tensione max. di manovra:', unit: 'V', min: 5, max: 500, step: 1, req: true },
  { id: 'frequenzaManovra', t: 'scelta', label: '35. Frequenza di manovra:', opzioni: OPZ_FREQ, req: true },
  ...campiOperatore('36, 86. Tensione motore porte:', '37, 87. Frequenza motore porte:'),
  { id: 'g_serrature', t: 'gruppo', label: 'Serrature delle porte di piano esistenti', show: contatti },
  { id: 'contattiAccessibili', t: 'si_no', label: 'Contatti delle serrature raggiungibili dal dito di prova:', req: true, show: contatti },
  { id: 'tensioneContatti', t: 'num', label: 'Tensione ai contatti delle serrature:', unit: 'V', min: 5, max: 500, step: 1, esperto: true,
    show: (x, ctx) => contatti(x, ctx) && x.contattiAccessibili === true },
];

/** The model's defaults ('Quadro Manovra '!N2, F6, F8, N19 and the operator's). */
const proposte = (): DatiRt2 => ({ tipoManovra: '1', tensioneForzaMotrice: 380, tensioneLuce: 220, frequenzaManovra: '50', ...PROPOSTE_OPERATORE });

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const nuovo = ctx.parti.includes('controller'), V = num(x, 'tensioneManovra'), cc = voceDi(FREQUENZE, str(x, 'frequenzaManovra'))?.cc ?? false;
  const verifiche: VerificaRt2[] = [verifica('quadro.tensioneManovra', 'Tensione dei circuiti di comando e di sicurezza', V, '<=', KR.ctrlVoltageMax,
    { unita: 'V', dec: 0, info: !nuovo, rif: 'UNI EN 81-20:2020, 5.10.1.3.2' })];
  if (contatti(x, ctx) && bool(x, 'contattiAccessibili') === true) {
    verifiche.push(verifica('quadro.contattiSerrature', `Tensione ai contatti delle serrature di piano esistenti (${cc ? 'c.c.' : 'c.a.'})`,
      num(x, 'tensioneContatti') ?? V, '<=', cc ? KR.lockContactDc : KR.lockContactAc, { unita: 'V', dec: 0, rif: 'UNI 10411-1:2024, 11.1.2' }));
  }
  return { verifiche, mancanti: mancantiCampi(CAMPI, x, ctx), avvisi: [], valori: { tensioneManovra: V, nuovo: nuovo ? 'si' : 'no' } };
}

const T = (s: string): FRiga => ({ t: 'testo', s });

/** «… V  50 Hz» or «… V  c.c.»: the frequency the model prints before its «Hz». */
function tensione(l: string, v: number | null, f: string | null, esito?: VerificaRt2['esito']): FRiga {
  const fr = voceDi(FREQUENZE, f);
  return valore(l, '', fmt(v, 0), fr ? (fr.cc ? 'V   c.c.' : `V   ${fr.t} Hz`) : 'V', esito);
}

function pagine(ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const nuovo = ctx.parti.includes('controller'), universale = str(x, 'tipoManovra') === '1', es = (id: string) => e.verifiche.find((v) => v.id === id)?.esito;
  const dichiarazione = nuovo
    ? ['Si dichiara che i  parametri  elettrici  (tensione, corrente, ecc.)  del nuovo', 'quadro  di  manovra, installato  sull\'impianto  in questione, sono perfettamen-',
      'te compatibili con le caratteristiche dei componenti elettrici ed elettromecca-', 'nici, preesistenti alla modifica, installati  nel vano di corsa ed in cabina (in',
      'particolare  con  le  serrature  delle porte di piano).', 'Il nuovo quadro di manovra è conforme alla norma UNI EN 81-20 : 2020']
    : ['Il quadro di manovra esistente resta in opera: i dati che seguono sono quelli del quadro installato.'];
  const contattiV = e.verifiche.find((v) => v.id === 'quadro.contattiSerrature');
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Quadro di Manovra:', righe: dichiarazione.map(T) },
    { t: 'sez', l: 'Manovra impianto:', righe: [T(voceDi(TIPI_MANOVRA, str(x, 'tipoManovra'))?.t ?? '—')] },
    { t: 'sez', l: 'Impianto di terra:', righe: [T('Conforme alle norme CENELEC'), T('resistenza di isolamento dell\' installazione elettrica '), T('CENELEC HD 384.6.61 S1')] },
    { t: 'sez', l: 'Circuiti:', righe: [T(nuovo ? 'Nuovi - Conformi (almeno) alle norme  CENELEC HD 21.3.S3 e HD 22.4.S4' : 'Esistenti, non modificati dall\'intervento.')] },
    { t: 'sez', l: 'Tensioni circuiti:', righe: [
      tensione('Linea Forza Motrice:', num(x, 'tensioneForzaMotrice'), '50'), tensione('Linea Luce:', num(x, 'tensioneLuce'), '50'),
      tensione('Tensione max. di manovra:', num(x, 'tensioneManovra'), str(x, 'frequenzaManovra'), es('quadro.tensioneManovra')),
      tensione('Tensione motore porte:', num(x, 'tensioneOperatore'), str(x, 'frequenzaOperatore')),
      ...(contattiV ? [valore('Tensione ai contatti delle serrature di piano:', '', fmt(contattiV.valore, 0), `V   ≤ ${fmt(contattiV.limite, 0)} V`, contattiV.esito)] : []),
    ] },
    { t: 'sez', l: 'Protezione circuiti:', righe: [
      T('Circuito di manovra: Trasformatore avente raddrizzatore  con un morsetto'), T('a terra; protezione contro i corto circuiti ottenuta con '), T('apposite valvole fusibili.'),
      T('Motore di sollevamento: Relè termico  di protezione  al motore'), T('contro il sovraccarico e la mancanza di'), T('fase.'),
    ] },
    { t: 'sez', l: 'Impedimento chiamata:', righe: [T('(Dispositivo per impedire la chiamata dai piani)'), ...(universale
      ? [T('Durante il movimento della cabina, per non meno di 4 secondi dopo la'), T('fermata della cabina e dopo la chiusura delle porte')]
      : [T('Non esiste; manovra con prenotazione')])] },
    { t: 'sez', l: 'Linee elettriche:', righe: [T('Le linee elettriche, per i tratti aggiunti o sostituiti,'), T('sono conformi alla normativa UNI EN 81-20 : 2020')] },
    { t: 'sez', l: 'Schemi elettrici:', righe: [T('Sono allegati gli schemi elettrici di  principio  dei circuiti di potenza e dei'),
      T('circuiti delle sicurezze; una nomenclatura spiega i segni usati.')] },
  ];
}

export const QUADRO: ModuloRt2 = { id: 'quadro', titolo: 'Quadro di manovra', campi: CAMPI, proposte, calcola, pagine };
