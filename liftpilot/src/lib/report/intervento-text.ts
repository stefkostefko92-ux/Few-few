// The intervention's words in the documents (round 45): the relazione's title, object and context row, the sentence of
// a modernisation, the label sheet 1's note, the draft order and the copied summary give it. Only for a calculation
// saved with its type (Calculation.intervento): a record without one keeps the words it was printed with, byte for
// byte (the callers test `tipo` before anything here). Our own words, clause numbers only. Pure.
import appIt from '../../../messages/it.json';
import type { CalcKey } from '../present/tr';
import { macchinaResta, type TipoIntervento } from '../lift/intervento';
import type { Collaudo } from '../lift/collaudo';

const TIPO = appIt.calculations.intervento;

type Prova = Pick<Collaudo, 'norma' | 'parti' | 'rifacimento'>;

/** The renovation keeping the existing sling: one only under UNI 10411 (collaudoOf). */
const rifDi = (C: Prova): boolean => C.rifacimento === true && C.norma !== 'en81';

/** The type in the documents' words: the form's label, the renovation and the machine kept said. */
export function etichettaIntervento(tipo: TipoIntervento, C: Prova): string {
  if (tipo !== 'AMMODERNAMENTO') return TIPO[tipo];
  return rifDi(C) ? `${TIPO.AMMODERNAMENTO} — rifacimento con l’arcata esistente`
    : macchinaResta(tipo, C) ? `${TIPO.AMMODERNAMENTO} con l’argano esistente` : TIPO.AMMODERNAMENTO;
}

/** What follows «Relazione di calcolo — » in the title of a calculation saved with its type. */
export function titoloCalcolo(tipo: TipoIntervento, C: Prova): string {
  if (tipo === 'TRASFORMAZIONE_COMPLETA') return 'trasformazione completa dell’impianto (collaudo come impianto nuovo)';
  if (tipo === 'SOLO_ARGANO') return 'sostituzione dell’argano';
  return rifDi(C) ? 'rifacimento dell’impianto con l’arcata esistente' : 'ammodernamento dell’impianto';
}

/** The opening of the object (before the layout and the roping in brackets), of a calculation saved with its type: the
 *  machine kept is verified as it is, with the modified lift's data. */
export function oggettoCalcolo(tipo: TipoIntervento, C: Prova): string {
  if (tipo === 'TRASFORMAZIONE_COMPLETA') return 'Verifica dell’argano a riduttore per la trasformazione completa dell’impianto';
  if (tipo === 'SOLO_ARGANO') return 'Verifica dell’argano a riduttore in sostituzione su impianto esistente';
  if (macchinaResta(tipo, C)) return 'Verifica dell’argano esistente con le modifiche dell’ammodernamento';
  return rifDi(C) ? 'Verifica dell’argano a riduttore per il rifacimento di un impianto esistente che ne mantiene l’arcata'
    : 'Verifica dell’argano a riduttore per l’ammodernamento di un impianto esistente';
}

/** The calculator's text of the context row (and of the copied summary) of a calculation saved with its type. */
export function contestoKey(tipo: TipoIntervento, C: Prova): CalcKey {
  return tipo === 'TRASFORMAZIONE_COMPLETA' ? 'ctx_trasformazione' : tipo === 'SOLO_ARGANO' ? 'ctx_solo' : rifDi(C) ? 'ctx_rif' : 'ctx_ammodernamento';
}

/** The sentence of a modernisation in the object (not a renovation, which keeps its own): the replacements and changes
 *  are constructive modifications (DPR 162/1999, art. 2 c.1 lett. cc)), the parts named (`parti`, in words); the machine
 *  kept is said. */
export const ammodernamentoText = (kept: boolean, parti: string): string => ` Ammodernamento dell’impianto esistente${kept
  ? ', con l’argano che resta e si verifica con i dati dell’impianto modificato' : ''}: le parti sostituite o modificate (${parti}) sono modifiche costruttive `
  + 'ai sensi del DPR 162/1999 e s.m.i. (art. 2, comma 1, lettera cc)), e l’impianto si sottopone a verifica straordinaria (art. 14).';

/** The relazione tecnica of a machine room surveyed on a calculation saved with its type: what follows «Relazione
 *  tecnica — ». */
export const titoloTecnica = (tipo: TipoIntervento): string => (tipo === 'AMMODERNAMENTO' ? 'ammodernamento dell’impianto' : 'sostituzione dell’argano');

/** The opening of the relazione tecnica's object of a modernisation (before the layout); null: the replacement's. */
export function oggettoTecnica(tipo: TipoIntervento, C: Prova, named: string | null): string | null {
  if (tipo !== 'AMMODERNAMENTO') return null;
  return macchinaResta(tipo, C) ? `Verifica dell’argano esistente${named ? ` (${named})` : ''}, che resta nell’ammodernamento dell’impianto`
    : `Sostituzione dell’argano nell’ammodernamento dell’impianto, con un argano a riduttore${named ? ` (${named})` : ''}`;
}

/** The note of sheet 1 on the test, opened by the type of a calculation saved with it. */
export const notaIntervento = (tipo: TipoIntervento, C: Prova): string => `Intervento: ${etichettaIntervento(tipo, C)}.`;
