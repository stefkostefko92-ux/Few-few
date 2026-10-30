// «Porte» of the RT after the owner's model (sheet «Porte», one page): the car door, its operator's voltage and
// frequency (shared with «Quadro di manovra» under the same ids: one value, E-Q8/E-P4), the safety of its closing, the
// landing doors, their locks and their fire protection — the model's lists and texts. Corrected: the operator «preesistente»
// follows the car door (the model's blank and single-space voltage: E-P1), the closing's safety texts only for a powered
// car door (E-P2), the locks' texts not for landing doors that stay (E-P3), the blank items given their meaning (E-P5).
// Added for new landing doors (UNI 10411-1:2024, 19.1–19.2; the first RT's rules, rt/componenti/porte.ts): the fire class
// not lower than the existing doors' (E-P6) and the height (E-P7). Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { altezzaPorta, confrontoFuoco } from '../../rt/componenti/porte';
import { fmt, mancantiCampi, num, str } from '../campi';
import { FREQUENZE, FUOCO, PORTA_CABINA_PREESISTENTE, PORTE_CABINA, PORTE_PIANO, PORTE_PIANO_PREESISTENTI, voceDi } from '../cataloghi/cqpl';
import type { CampoRt2, ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, PaginaCtx, VerificaRt2 } from '../types';
import { PROPOSTE_OPERATORE, campiOperatore } from './quadro';
import { righeCorrezioni, valore } from './righe';

const cabina = (x: DatiRt2) => voceDi(PORTE_CABINA, str(x, 'tipoPortaCabina'));
const piano = (x: DatiRt2) => voceDi(PORTE_PIANO, str(x, 'tipoPortePiano'));
const motorizzata = (x: DatiRt2): boolean => !!cabina(x)?.motore;
const pianiNuovi = (x: DatiRt2): boolean => !!piano(x) && str(x, 'tipoPortePiano') !== PORTE_PIANO_PREESISTENTI;
const opz = (xs: readonly { v: string; t: string }[]) => xs.map((o) => ({ v: o.v, t: o.t }));

const CAMPI: readonly CampoRt2[] = [
  { id: 'g_cabina', t: 'gruppo', label: 'Cabina:' },
  { id: 'tipoPortaCabina', t: 'scelta', label: '88. Tipo di porta:', req: true, opzioni: opz(PORTE_CABINA) },
  ...campiOperatore('36, 86. Tensione operatore:', '37, 87. Frequenza operatore:', motorizzata),
  { id: 'g_piano', t: 'gruppo', label: 'Piano:' },
  { id: 'tipoPortePiano', t: 'scelta', label: '85. Tipo porte:', req: true, opzioni: opz(PORTE_PIANO) },
  { id: 'protezioneFuoco', t: 'scelta', label: '84. Protezione al fuoco EI:', req: true, opzioni: opz(FUOCO) },
  { id: 'g_esistenti', t: 'gruppo', label: 'Porte di piano esistenti e nuove', show: pianiNuovi },
  { id: 'fuocoEsistente', t: 'scelta', label: 'Protezione al fuoco delle porte di piano esistenti:', req: true, opzioni: opz(FUOCO), show: pianiNuovi },
  { id: 'altezzaEsistenti', t: 'num', label: 'Altezza delle porte di piano esistenti:', unit: 'mm', min: 1500, max: 2500, step: 1, req: true, show: pianiNuovi },
  { id: 'altezzaNuove', t: 'num', label: 'Altezza delle nuove porte di piano:', unit: 'mm', min: 1500, max: 2500, step: 1, req: true, show: pianiNuovi },
];

/** The model's defaults (Porte!V20 = 1, V30 = 1, T54 = 1, the operator's), the doors that stay by the calculation's parts. */
const proposte = (ctx: ContestoRt2): DatiRt2 => ({
  tipoPortaCabina: ctx.parti.includes('carDoors') || ctx.parti.includes('slidingDoors') ? '1' : PORTA_CABINA_PREESISTENTE,
  tipoPortePiano: ctx.parti.includes('landingDoors') ? '1' : PORTE_PIANO_PREESISTENTI, protezioneFuoco: '1', ...PROPOSTE_OPERATORE,
});

const U1 = 'UNI 10411-1:2024';

function calcola(ctx: ContestoRt2, x: DatiRt2): EsitoRt2 {
  const verifiche: VerificaRt2[] = [];
  if (pianiNuovi(x)) {
    const es = voceDi(FUOCO, str(x, 'fuocoEsistente')), nu = voceDi(FUOCO, str(x, 'protezioneFuoco'));
    const f = es && nu ? confrontoFuoco(es.classe, nu.classe) : null;
    verifiche.push({ id: 'porte.fuoco', testo: 'Resistenza al fuoco delle nuove porte di piano (minuti), non inferiore alle esistenti', valore: f?.value ?? null,
      limite: f?.limit ?? null, confronto: '>=', unita: 'min', dec: 0, esito: f?.status === 'ok' || f?.status === 'warn' ? f.status : 'fail', rif: `${U1}, 19.2` });
    const hN = num(x, 'altezzaNuove'), hE = num(x, 'altezzaEsistenti'), h = hN !== null && hE !== null ? altezzaPorta(hN, hE) : null;
    verifiche.push({ id: 'porte.altezza', testo: 'Altezza delle nuove porte di piano', valore: hN, limite: h?.limit ?? null, confronto: '>=', unita: 'mm', dec: 0,
      esito: h?.status === 'ok' || h?.status === 'warn' ? h.status : 'fail', rif: `${U1}, 19.1; UNI EN 81-20:2020, 5.3.2.1; UNI EN 81-21:2022, 5.12` });
  }
  const avvisi = verifiche.some((v) => v.id === 'porte.altezza' && v.esito === 'warn')
    ? ['Porte di piano più basse di quanto chiede la UNI EN 81-20: ammesse solo dove le aperture dell\'edificio non lo consentono (da dichiarare).'] : [];
  return { verifiche, mancanti: mancantiCampi(CAMPI, x, ctx), avvisi, valori: { tensioneOperatore: motorizzata(x) ? num(x, 'tensioneOperatore') : null } };
}

const T = (s: string): FRiga => ({ t: 'testo', s });

/** «Motore porte: Massima tensione»: the powered car door's operator, «preesistente» with the car door that stays, none
 *  with a manual one (E-P1). */
function motore(x: DatiRt2): FRiga {
  const c = cabina(x), f = voceDi(FREQUENZE, str(x, 'frequenzaOperatore'));
  if (c?.motore) return valore('Massima tensione:', '', fmt(num(x, 'tensioneOperatore'), 0), `V   ${f?.porte ?? ''}`.trimEnd());
  return c?.v === PORTA_CABINA_PREESISTENTE ? valore('Massima tensione:', '', 'preesistente') : T('Porta di cabina ad azionamento manuale: nessun motore.');
}

function pagine(_ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const c = cabina(x), l = piano(x), fuoco = voceDi(FUOCO, str(x, 'protezioneFuoco'));
  const sicurezza = c?.motore
    ? ['La spinta e l\'energia cinetica delle porte in chiusura sono non maggiori dei', 'valori massimi previsti dalla norma di riferimento.',
      'La porta è dotata di un collegamento elastico delle antine al braccio', 'dell\'operatore per ottenere la riapertura totale in caso di ostacolo.']
    : c?.v === PORTA_CABINA_PREESISTENTE ? ['preesistente/i'] : ['Porta di cabina ad azionamento manuale.'];
  const serrature = l?.v === PORTE_PIANO_PREESISTENTI ? ['preesistenti']
    : ['Le serrature sono di tipo meccanico azionate da un meccanismo montato', 'sulla cabina', 'La serratura è dotata di controllo elettrico di sicurezza del catenaccio e di',
      'contatto di sicurezza di accostamento porte.', 'Nella sezione allegati sono contenuti i certificati delle serrature in oggetto'];
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Porta di cabina:', righe: (c?.righe ?? ['—']).map(T) },
    { t: 'sez', l: 'Motore porte:', righe: [motore(x)] },
    { t: 'sez', l: 'Dispositivi di sicurezza\nporta di cabina:', righe: sicurezza.map(T) },
    { t: 'sez', l: 'Porte di piano:', righe: (l?.righe ?? ['—']).map(T) },
    { t: 'sez', l: 'Serrature:', righe: serrature.map(T) },
    { t: 'sez', l: 'Resistenza al fuoco:', righe: [T(fuoco?.t ?? '—'), ...(fuoco?.frase ? [T(fuoco.frase)] : [])] },
    ...righeCorrezioni(e.verifiche),
  ];
}

export const PORTE: ModuloRt2 = { id: 'porte', titolo: 'Porte', campi: CAMPI, proposte, calcola, pagine };
