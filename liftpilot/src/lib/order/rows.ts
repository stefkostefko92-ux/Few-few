// The rows of the draft order that say what the maker sizes and builds the machine by, beyond its data sheet: the hand
// the design gives it (registry ordine.esecuzione), the supply and the duty of the motor with the brake's coil, its
// self-monitoring switches and its release (from the data of the installation, else to be filled in), the protection
// against the car's overspeed upward and its uncontrolled movement (registry impianto.acop.ucm), and with the machine
// below beside the shaft the slow shaft through the wall (registry impianto.basso.albero). Italian; clause numbers only.
// Pure.
import type { Machine } from '@/calc/types';
import { mountOf } from '@/lib/catalog/mounting';
import type { MachineCandidate } from '@/lib/lift/advice';
import type { Collaudo } from '@/lib/lift/collaudo';
import type { Plant } from '@/lib/plant';
import type { ReportBlock } from '@/lib/report/model';
import type { OrderSite } from './site';

type Fmt = (x: number, dec?: number) => string;
type Row = [string, string];

const BLANK = '______';
const box = (on: boolean): string => (on ? '☒' : '☐');

/** The hand: from the design, ticked, to be confirmed with the maker's scheme; else both boxes empty. `ref`: where the
 *  drawing shows it. */
export function handRow(site: OrderSite | undefined, ref: string): Row {
  const h = site?.hand ?? null;
  return ['Esecuzione (vista dal lato puleggia)', h
    ? `${box(h === 'destra')} destra   ${box(h === 'sinistra')} sinistra — dal progetto: motore a ${h} guardando l’argano dal lato della puleggia${ref}; `
      + 'da confermare con lo schema di esecuzione del costruttore'
    : `☐ destra   ☐ sinistra${ref}`];
}

/** The supply, the motor's duty and protection, the brake's coil, switches and release, encoder and flywheel: the data
 *  of the installation where given (plant.ts), the usual three-phase 400 V at the motor's frequency marked as such. */
export function driveRows(N: Machine, plant: Plant | undefined, fmt: Fmt): Row[] {
  const P = plant ?? {}, volt = P.voltage ?? 400, hz = P.frequency ?? N.fn, given = P.voltage != null && P.frequency != null;
  const num = (x: number | undefined, unit: string): string => (x == null ? `${BLANK} ${unit}` : `${fmt(x, Number.isInteger(x) ? 0 : 1)} ${unit}`);
  return [
    ['Alimentazione', `${fmt(volt, 0)} V trifase, ${fmt(hz, 0)} Hz${given ? ' (dati dell’impianto)' : ' (valori usuali: da confermare con i dati dell’impianto)'}; luce ${num(P.lightVoltage, 'V')}`],
    ['Servizio del motore', `${BLANK} avviamenti all’ora · rapporto di intermittenza ${num(P.duty, '%')}`
      + (P.currentIn != null || P.currentStart != null ? ` · corrente nominale ${num(P.currentIn, 'A')}, di avviamento ${num(P.currentStart, 'A')}` : '')],
    ['Motore', `grado di protezione IP ${BLANK} · classe d’isolamento ${BLANK} · termistori ☐ · ventilazione forzata ☐`],
    ['Elettromagnete del freno', `bobina ${BLANK} V c.c. · microinterruttori di controllo su ogni gruppo ☐ (autocontrollo: UNI EN 81-20:2020, 5.6.6.2 e 5.6.7.3)`],
    ['Sblocco del freno', 'leva manuale ☐   a distanza ☐ (manovra di emergenza: UNI EN 81-20:2020, 5.9.2.2.2.9)'],
    ['Encoder · volano', `encoder ☐ tipo ${BLANK} · volano ☐`],
  ];
}

/** The protection against the car's overspeed upward (ACOP, 5.6.6) and its uncontrolled movement (UCM, 5.6.7): a new
 *  lift asks how it is made — never by the brake on the motor's shaft of a geared machine —; a modification with the
 *  machine replaced, that the existing protections keep working (UNI 10411-1:2024, 14.4; UNI 10411-11:2024, 14.3 and
 *  annex A); none otherwise. */
export function acopBlocks(C: Collaudo): ReportBlock[] {
  if (C.norma === 'en81') {
    return [
      { t: 'h3', text: 'Protezione contro la sovravelocità in salita (ACOP) e i movimenti incontrollati della cabina (UCM)' },
      { t: 'kv', rows: [
        ['Organo d’arresto', 'su cabina, contrappeso, funi, puleggia di frizione o albero della puleggia sostenuto in due soli punti (UNI EN 81-20:2020, '
          + '5.6.6.4 e 5.6.7.4): non il freno dell’albero del motore, che con il riduttore sta prima della riduzione'],
        ['Soluzione richiesta', '☐ freno sull’albero lento o sulla puleggia, certificato come organo d’arresto ACOP e UCM (fornito con l’argano)   '
          + '☐ bloccafuni certificato   ☐ paracadute di cabina bidirezionale e rilevamento dei movimenti incontrollati nel quadro'],
        ['Certificato di esame UE del tipo', `n. ${BLANK}${BLANK} (componente di sicurezza: UNI EN 81-20:2020, 5.6.6.11 e 5.6.7.13)`],
        ['Prove al collaudo', 'UNI EN 81-20:2020, 6.3.11–6.3.13: cabina vuota in salita frenata dal solo dispositivo; movimento incontrollato in salita e in discesa'],
      ] },
    ];
  }
  if (!C.parti.includes('machine')) return [];
  const one = C.norma === '10411-1';
  return [
    { t: 'h3', text: 'Protezioni ACOP e UCM esistenti con l’argano nuovo' },
    { t: 'kv', rows: [
      ['Requisito', one
        ? 'UNI 10411-1:2024, 14.4 c), d) e g): le protezioni ACOP e UCM esistenti devono continuare a funzionare con l’argano nuovo; senza UCM '
          + 'conforme alla UNI EN 81-20 5.6.7 e con la regolazione della velocità, se il freno non si apre l’alimentazione del macchinario si toglie e '
          + 'si ripristina solo a mano'
        : 'UNI 10411-11:2024, 14.3 a) e b) e appendice A (14): le protezioni UCM esistenti devono continuare a funzionare; per l’ACOP esistente una '
          + 'relazione di compatibilità con l’argano nuovo oppure dispositivi nuovi con certificato di esame del tipo; senza UCM conforme, il '
          + 'controllo dell’apertura del freno'],
      ['Situazione dell’impianto', '☐ protezioni indipendenti dall’argano (restano)   ☐ sull’argano sostituito: freno sull’albero lento o sulla '
        + 'puleggia certificato con l’argano nuovo   ☐ assenti'],
      ['Microinterruttori di controllo del freno', '☐ richiesti su ogni gruppo'],
    ] },
  ];
}

/** A machine below beside the shaft: the variant (long slow shaft or outboard support), the sheave's overhang from the
 *  gearbox's face through the wall, the static load the catalogue allows there; a machine below without the design's
 *  geometry (a calculation): the same to be measured. None above or under the pit. */
export function belowBlocks(c: MachineCandidate, site: OrderSite | undefined, fmt: Fmt): ReportBlock[] {
  if (c.I.layout !== 'bottom' || site?.below === 'under') return [];
  const mount = mountOf(c), t = site?.through ?? null, table = mount?.byLength?.length ? mount.byLength : null;
  return [
    { t: 'h3', text: 'Albero lento prolungato attraverso il muro (macchina in basso accanto al vano)' },
    { t: 'kv', rows: [
      ['Variante', mount ? `${mount.kind === 'long' ? 'albero lento lungo' : 'albero lento con supporto esterno'} (${c.brand} ${c.model})`
        : 'argano standard: chiedere al costruttore la variante ad albero lungo o con supporto esterno'],
      ['Sbalzo della puleggia', t
        ? `${fmt(t.overhang, 0)} mm dalla faccia del riduttore al piano medio della puleggia; muro attraversato ${fmt(t.wall, 0)} mm; albero più lungo dello standard di ${fmt(t.ext, 0)} mm`
        : `${BLANK} mm dalla faccia del riduttore al piano medio della puleggia (da rilevare); muro attraversato ${BLANK} mm`],
      ['Supporto esterno', '☐ richiesto (oltre la puleggia, nel vano)   ☐ non richiesto — secondo il costruttore'],
      ['Carico statico ammesso con l’albero prolungato', `${fmt(c.staticKg, 0)} kg ${table ? `(scheda del costruttore: con l’albero più lungo; ${table.map((x) => fmt(x, 0)).join(' / ')} kg secondo la lunghezza)` : '(dato di catalogo)'}; `
        + `nella prova ${fmt(c.testKg, 0)} kg verso l’alto: da confermare con il costruttore per lo sbalzo indicato`],
    ] },
  ];
}
