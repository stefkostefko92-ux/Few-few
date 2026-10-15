'use client';

// The type of intervention of «Calcolo argano» with its test and the parts answered (round 45): what choosing a type,
// answering a part, the renovation or an example sets, in the test and in the calculation's values (the context, the
// existing machine compared). The test sent with the save is the one chosen with the rule's answers (new ropes of their
// own number and diameter are replaced); what the documents read is collaudoOf of it. A modernisation left for the
// transformation and chosen again comes back with its answers. Pure state, no server.
import { useMemo, useState } from 'react';
import type { FormValues } from '@/calc/types';
import { collaudoOf, interventoDi, interventoTo, interventoValido, macchinaResta, rifacimentoTo, type Collaudo, type Parte, type TipoIntervento } from '@/lib/lift';
import { daIndicare, partiDi, rispondi, risposteDopo, risposteRifacimento } from '@/lib/lift/risposte';

export interface InterventoInit {
  tipo: TipoIntervento | null;
  collaudo: Collaudo | null;
  risposte: readonly Parte[];
}

/** A modernisation left for the transformation: its answers and what the existing machine's comparison was. */
type Lasciato = { chosen: Collaudo; risposte: Parte[]; values: FormValues };

export function useIntervento(init: InterventoInit, values: FormValues, edit: (patch: FormValues) => void) {
  const [tipo, setTipo] = useState<TipoIntervento | null>(init.tipo);
  const [chosen, setChosen] = useState<Collaudo | undefined>(init.collaudo ?? undefined);
  const [risposte, setRisposte] = useState<Parte[]>(() => [...init.risposte]);
  // the modernisation left for the transformation (point 21.1's «Passa», or a click): coming straight back, its answers
  // return as they were — UI state only, nothing saved or hashed
  const [lasciato, setLasciato] = useState<Lasciato | null>(null);
  const repl = tipo === 'SOLO_ARGANO' || tipo === 'AMMODERNAMENTO';
  // ropes of their own number and diameter are new: the rule's «Sì», whatever was answered (it comes back when the
  // ropes in place are kept again)
  const forced = repl && !!chosen && !values.keepRopes && !chosen.parti.includes('ropes');
  const effective = useMemo(() => (forced && chosen ? rispondi(chosen, 'ropes', true) : chosen), [forced, chosen]);
  const value = useMemo(() => collaudoOf(values, effective), [values, effective]);
  const mancanti = useMemo(() => daIndicare(tipo, effective, value, values, risposte), [tipo, effective, value, values, risposte]);
  const incoerenze = useMemo(() => (tipo ? interventoValido(tipo, values, effective) : []), [tipo, values, effective]);

  /** A type chosen: its context and test; a transformation compares no existing machine, a modification of what was a
   *  new lift compares it again (the replacement's default). */
  const choose = (t: TipoIntervento): void => {
    if (t === tipo) return;
    setLasciato(tipo === 'AMMODERNAMENTO' && t === 'TRASFORMAZIONE_COMPLETA' && chosen
      ? { chosen, risposte, values: { compare: values.compare, keepD: values.keepD } } : null);
    if (t === 'AMMODERNAMENTO' && tipo === 'TRASFORMAZIONE_COMPLETA' && lasciato) {
      edit({ context: 'repl', ...lasciato.values });
      setChosen(lasciato.chosen);
      setRisposte(lasciato.risposte);
      setTipo(t);
      return;
    }
    const r = interventoTo(t, chosen);
    edit({ ...r.values, ...(t === 'TRASFORMAZIONE_COMPLETA' ? { compare: false, keepD: false } : values.context !== 'repl' ? { compare: true } : {}) });
    setChosen(r.collaudo);
    setRisposte(risposteDopo(t, risposte));
    setTipo(t);
  };
  /** A part answered; the machine kept is not compared with itself. */
  const answer = (p: Parte, si: boolean): void => {
    if (!chosen) return;
    setChosen(rispondi(chosen, p, si));
    setRisposte((r) => (r.includes(p) ? r : [...r, p]));
    if (p === 'machine' && tipo === 'AMMODERNAMENTO' && si !== chosen.parti.includes('machine')) edit(si ? { compare: true } : { compare: false, keepD: false });
  };
  /** «Rifacimento con l'arcata esistente» on or off. */
  const rifacimento = (on: boolean): void => {
    if (!chosen) return;
    const r = rifacimentoTo(on, chosen);
    edit({ ...r.values, ...(on && !chosen.parti.includes('machine') ? { compare: true } : {}) });
    setChosen(r.collaudo);
    setRisposte(risposteRifacimento(on, risposte));
  };
  /** An example loaded: its type by its shape, every part of it answered (the example is complete). */
  const esempio = (V: FormValues): void => {
    const t = interventoDi(V.context, null), r = interventoTo(t, chosen);
    setLasciato(null);
    setTipo(t);
    setChosen(r.collaudo);
    setRisposte([...partiDi(t)]);
  };
  return {
    tipo, chosen, effective, value, risposte, mancanti, incoerenze, resta: macchinaResta(tipo, value),
    rif: chosen?.rifacimento === true, choose, answer, rifacimento, esempio, setCollaudo: (c: Collaudo) => setChosen(c),
  };
}
