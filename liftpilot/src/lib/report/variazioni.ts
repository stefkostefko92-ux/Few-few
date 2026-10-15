// The changes of the rated speed and of the travel against the documented state (UNI 10411-1:2024, 15 and 16; UNI
// 10411-11:2024, 15 and 16), as the documents print them: the rows of the relazione's data of the installation
// («Velocità documentata · variazione», «Corsa del primo collaudo · variazione» — under -11 «Corsa documentata») and the
// sentence of sheet 1's COLLAUDO note, kept out of collaudo.ts (round 46, B5). Only with what the logbook documents
// (Collaudo.libretto): a record without it prints nothing, as before. And (B6) the row of the existing controller's
// speed regulation under a new machine — with a ⚠ when it was not answered (a record saved before the question): the
// relazioni only, sheet 1 stays as issued. Our words with the clause numbers. Pure.
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '../lift/collaudo';
import { corsaOf, variazioneCorsa, variazioneVelocita, velocitaOf, type Norma10411 } from '../lift/modifica';

/** What a change is about: the rated speed or the travel. */
export type VoceVariazione = 'velocita' | 'corsa';

/** A change the documents print: about what, its row's label and text for the relazione, its sentence for sheet 1
 *  (opened by a space; '' when nothing changes). */
export interface VariazioneDoc {
  voce: VoceVariazione;
  label: string;
  text: string;
  nota: string;
}

/** The labels of the relazione's rows (the travel's by the part of UNI 10411: the first test's under -1, the documented
 *  one under -11). */
export const VOCE_VARIAZIONE = {
  velocita: 'Velocità documentata · variazione',
  corsa: 'Corsa del primo collaudo · variazione',
  corsa11: 'Corsa documentata · variazione',
} as const;

const num = (x: number, d: number): string => new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
const pct = (x: number): string => `${x < 0 ? '−' : '+'}${num(Math.abs(x) * 100, 1)} %`;
const metri = (x: number): string => `${x < 0 ? '−' : '+'}${num(Math.abs(x), 2)} m`;
type Lib = NonNullable<Collaudo['libretto']>;

function velocita(n: Norma10411, lib: Lib, v: number): VariazioneDoc | null {
  const x = variazioneVelocita(n, lib, v);
  if (!x) return null;
  const doc = n === '10411-1'
    ? [lib.v ? `${num(lib.v, 2)} m/s (libretto o verbale)` : '', lib.v50 ? `${num(lib.v50, 2)} m/s dopo il passaggio a 50 Hz` : ''].filter(Boolean).join(', ')
    : `${num(x.rif, 2)} m/s (documentata)`;
  const head = `${doc}; progetto ${num(v, 2)} m/s, ${pct(x.dv)} rispetto a ${num(x.rif, 2)} m/s`, label = VOCE_VARIAZIONE.velocita;
  if (n === '10411-11') {
    if (!x.variata) return { voce: 'velocita', label, text: `${head}: invariata entro l’arrotondamento dei dati.`, nota: '' };
    const ucm = x.ucm15i ? '; oltre il 5 % serve la protezione UCM della UNI EN 81-20, 5.6.7 (15 i))' : '';
    return { voce: 'velocita', label, text: `${head}: velocità variata, entra tra le parti modificate (UNI 10411-11, 15, valutazione 4.3)${ucm}.`,
      nota: ` Velocità ${num(x.rif, 2)} → ${num(v, 2)} m/s: variata (UNI 10411-11, 15)${x.ucm15i ? ', protezione UCM (15 i))' : ''}.` };
  }
  const what = x.aumento ? 'oltre il 5 % sopra il riferimento: velocità variata, entra tra le parti modificate (UNI 10411-1, 15.1: punti da 15.2 a 15.15)'
    : x.calo ? 'oltre il 5 % sotto la velocità iniziale o documentata: velocità variata, entra tra le parti modificate (UNI 10411-1, 15.16: punti 15.2 e 15.17)'
      : 'entro il 5 % (UNI 10411-1, 15.1 e 15.16): la velocità non entra tra le parti modificate; se sia comunque un cambio della velocità ai sensi del DPR '
        + '162/1999 lo valuta il tecnico';
  return { voce: 'velocita', label, text: `${head}: ${what}.`,
    nota: x.variata ? ` Velocità ${num(x.rif, 2)} → ${num(v, 2)} m/s (${pct(x.dv)}): variata (UNI 10411-1, ${x.aumento ? '15.1' : '15.16'}).` : '' };
}

function corsa(n: Norma10411, lib: Lib, H: number): VariazioneDoc | null {
  const x = variazioneCorsa(n, lib, H);
  if (!x || !lib.H) return null;
  const label = n === '10411-1' ? VOCE_VARIAZIONE.corsa : VOCE_VARIAZIONE.corsa11;
  const head = `${num(lib.H, 2)} m (${n === '10411-1' ? 'primo collaudo' : 'documentata'}); progetto ${num(H, 2)} m, ${metri(x.dH)}`;
  if (!x.variata) return { voce: 'corsa', label, text: `${head}: invariata entro l’arrotondamento dei dati.`, nota: '' };
  const what = x.accorciata
    ? `accorciata, la corsa entra tra le parti modificate (DPR 162/1999, art. 2 c.1 lett. cc) n. 3)); il punto 16 tratta solo l’allungamento: valutazione ${
      n === '10411-1' ? 'del punto 4' : '4.3'}`
    : `allungata, la corsa entra tra le parti modificate (${n === '10411-1' ? 'UNI 10411-1, 16 a)–l)' : 'UNI 10411-11, 16 a)–i), valutazione 4.3'})`;
  const oltre = x.oltre8 ? ' ⚠ Oltre 8 m dal primo collaudo l’intervento conta come nuova installazione (UNI 10411-1, 16): da confermare con il soggetto che esegue la verifica.' : '';
  return { voce: 'corsa', label, text: `${head}: ${what}.${oltre}`,
    nota: ` Corsa ${num(lib.H, 2)} → ${num(H, 2)} m: variata${x.oltre8 ? ' — ⚠ oltre 8 m: nuova installazione (UNI 10411-1, 16), da confermare' : ''}.` };
}

/** The changes of speed and travel the documents print for a modification under UNI 10411 with what its logbook says
 *  (none otherwise), against the calculation's values `V`. */
export function variazioniDoc(C: Pick<Collaudo, 'norma' | 'libretto'>, V: FormValues | null | undefined): VariazioneDoc[] {
  const lib = C.libretto;
  if (C.norma === 'en81' || !lib || !V) return [];
  const v = lib.v || lib.v50 ? velocitaOf(V) : null, H = lib.H ? corsaOf(V) : null;
  return [v !== null ? velocita(C.norma, lib, v) : null, H !== null ? corsa(C.norma, lib, H) : null].filter((x): x is VariazioneDoc => x !== null);
}

/** The rows of the relazione's data of the installation, one per change, in their order. */
export const variazioniRows = (list: readonly VariazioneDoc[]): [string, string][] => list.map((x) => [x.label, x.text]);

/** The sentence of sheet 1's COLLAUDO note: the changes' sentences ('' without one). */
export const variazioniNota = (list: readonly VariazioneDoc[]): string => list.map((x) => x.nota).join('');

/** The row of the existing controller's speed regulation in the relazione's data of the installation (round 46, B6): a
 *  modification whose new machine stays on the existing controller (the controller not among the parts) — answered,
 *  what it is; not answered, a ⚠ (UNI 10411-1:2024 11.2.1, UNI 10411-11:2024 11.2: no regulation added to a controller
 *  without one, while the software sizes the new machine for a frequency converter). None otherwise. */
export function regolazioneRows(C: Pick<Collaudo, 'norma' | 'parti' | 'regolazione'>): [string, string][] {
  if (C.norma === 'en81' || !C.parti.includes('machine') || C.parti.includes('controller')) return [];
  const rif = C.norma === '10411-1' ? 'UNI 10411-1:2024, 11.2.1' : 'UNI 10411-11:2024, 11.2', label = 'Regolazione della velocità del quadro esistente';
  const regola = `la macchina nuova resta sul quadro esistente e il software la dimensiona per la regolazione con inverter; non si aggiunge la `
    + `regolazione a un quadro che non l’ha (${rif})`;
  if (!C.regolazione) return [[label, `⚠ Non indicata: ${regola}. Verificare che il quadro esistente l’abbia, altrimenti sostituire il quadro.`]];
  if (C.regolazione === 'vvvf') return [[label, `inverter (VVVF): la regolazione resta (${rif}); sostituendo il suo dispositivo vale anche ${C.norma === '10411-1' ? 'l’11.1.4' : 'l’11.1.3'}.`]];
  return [[label, `⚠ ${C.regolazione === '2v' ? 'a due velocità' : 'a una velocità'}: ${regola}. Il quadro va sostituito.`]];
}
