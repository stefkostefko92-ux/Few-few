// The changes of the rated speed and of the travel against the documented state (UNI 10411-1:2024, 15 and 16; UNI
// 10411-11:2024, 15 and 16), as the documents print them: the rows of the relazione's data of the installation
// («Velocità documentata · variazione», «Corsa del primo collaudo · variazione») and the sentence of sheet 1's COLLAUDO
// note, kept out of collaudo.ts (round 46, B5). Skeleton of round 46 S2: the inputs (Collaudo.libretto, S3) and the rules
// (modifica.ts, S4) come with the next steps — until then no change is known and nothing is printed. Pure.

/** What a change is about: the rated speed or the travel. */
export type VoceVariazione = 'velocita' | 'corsa';

/** A change the documents print: about what, and its text (the documented value, the design's, the consequence). */
export interface VariazioneDoc {
  voce: VoceVariazione;
  text: string;
}

/** The labels of the relazione's rows. */
export const VOCE_VARIAZIONE: Readonly<Record<VoceVariazione, string>> = {
  velocita: 'Velocità documentata · variazione',
  corsa: 'Corsa del primo collaudo · variazione',
};

/** The rows of the relazione's data of the installation, one per change, in their order. */
export const variazioniRows = (list: readonly VariazioneDoc[]): [string, string][] => list.map((x) => [VOCE_VARIAZIONE[x.voce], x.text]);

/** The sentence of sheet 1's COLLAUDO note: the changes' texts, each opened by a space ('' without one). */
export const variazioniNota = (list: readonly VariazioneDoc[]): string => list.map((x) => ` ${x.text}`).join('');
