'use client';

// The type of intervention of «Calcolo argano» with its test and the parts answered (round 45): what choosing a type,
// answering a part, the renovation or an example sets, in the test and in the calculation's values (the context, the
// existing machine compared). The test sent with the save is the one chosen with the rule's answers (new ropes of their
// own number and diameter are replaced); what the documents read is collaudoOf of it. A modernisation left for the
// transformation and chosen again comes back with its answers. «Argano: No» puts the existing machine's data in the
// machine's fields (the machine kept is the existing one), «Sì» again brings back the machine replaced (round 46,
// src/lib/calc-resta.ts). Pure state, no server.
import { useMemo, useState } from 'react';
import type { FormValues } from '@/calc/types';
import { collaudoOf, interventoDi, interventoTo, interventoValido, macchinaResta, rifacimentoTo, type Collaudo, type Parte, type TipoIntervento } from '@/lib/lift';
import { daIndicare, partiDi, rispondi, risposteDopo, risposteRifacimento } from '@/lib/lift/risposte';
import { arganoResta, arganoSostituito, macchinaDi } from '@/lib/calc-resta';

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
  // the machine replaced while «Argano: No» holds the existing one's data in its fields (restored by «Sì»)
  const [sostituita, setSostituita] = useState<FormValues | null>(null);
  const repl = tipo === 'SOLO_ARGANO' || tipo === 'AMMODERNAMENTO';
  // ropes of their own number and diameter are new: the rule's «Sì», whatever was answered (it comes back when the
  // ropes in place are kept again)
  const forced = repl && !!chosen && !values.keepRopes && !chosen.parti.includes('ropes');
  const effective = useMemo(() => (forced && chosen ? rispondi(chosen, 'ropes', true) : chosen), [forced, chosen]);
  const value = useMemo(() => collaudoOf(values, effective), [values, effective]);
  const mancanti = useMemo(() => daIndicare(tipo, effective, value, values, risposte), [tipo, effective, value, values, risposte]);
  const incoerenze = useMemo(() => (tipo ? interventoValido(tipo, values, effective) : []), [tipo, values, effective]);
  const restaOra = macchinaResta(tipo, value);

  /** The change `patch` with what the machine kept or replaced again brings, when the type `t` and the test `c` turn
   *  «Argano: No» on or off; a modification compares the existing machine again once it is replaced. */
  const conMacchina = (patch: FormValues, t: TipoIntervento | null, c: Collaudo | undefined): FormValues => {
    const V = { ...values, ...patch }, poi = macchinaResta(t, collaudoOf(V, c));
    if (poi === restaOra) return patch;
    if (poi) {
      setSostituita(macchinaDi(values));
      return { ...patch, ...arganoResta(V, !c?.parti.includes('ropes')) };
    }
    setSostituita(null);
    return { ...patch, ...arganoSostituito(V, sostituita), ...(t !== 'TRASFORMAZIONE_COMPLETA' && patch.compare === undefined ? { compare: true } : {}) };
  };

  /** A type chosen: its context and test; a transformation compares no existing machine, a modification of what was a
   *  new lift compares it again (the replacement's default). */
  const choose = (t: TipoIntervento): void => {
    if (t === tipo) return;
    setLasciato(tipo === 'AMMODERNAMENTO' && t === 'TRASFORMAZIONE_COMPLETA' && chosen
      ? { chosen, risposte, values: { compare: values.compare, keepD: values.keepD } } : null);
    if (t === 'AMMODERNAMENTO' && tipo === 'TRASFORMAZIONE_COMPLETA' && lasciato) {
      edit(conMacchina({ context: 'repl', ...lasciato.values }, t, lasciato.chosen));
      setChosen(lasciato.chosen);
      setRisposte(lasciato.risposte);
      setTipo(t);
      return;
    }
    const r = interventoTo(t, chosen);
    edit(conMacchina({ ...r.values, ...(t === 'TRASFORMAZIONE_COMPLETA' ? { compare: false, keepD: false } : values.context !== 'repl' ? { compare: true } : {}) }, t, r.collaudo));
    setChosen(r.collaudo);
    setRisposte(risposteDopo(t, risposte));
    setTipo(t);
  };
  /** A part answered; the machine kept is not compared with itself. */
  const answer = (p: Parte, si: boolean): void => {
    if (!chosen) return;
    const next = rispondi(chosen, p, si);
    setChosen(next);
    setRisposte((r) => (r.includes(p) ? r : [...r, p]));
    const patch = conMacchina(p === 'machine' && tipo === 'AMMODERNAMENTO' && si !== chosen.parti.includes('machine') ? (si ? { compare: true } : { compare: false, keepD: false }) : {}, tipo, next);
    if (Object.keys(patch).length) edit(patch);
  };
  /** «Rifacimento con l'arcata esistente» on or off. */
  const rifacimento = (on: boolean): void => {
    if (!chosen) return;
    const r = rifacimentoTo(on, chosen);
    edit(conMacchina({ ...r.values, ...(on && !chosen.parti.includes('machine') ? { compare: true } : {}) }, tipo, r.collaudo));
    setChosen(r.collaudo);
    setRisposte(risposteRifacimento(on, risposte));
  };
  /** An example loaded: its type by its shape, every part of it answered (the example is complete). */
  const esempio = (V: FormValues): void => {
    const t = interventoDi(V.context, null), r = interventoTo(t, chosen);
    setLasciato(null);
    setSostituita(null);
    setTipo(t);
    setChosen(r.collaudo);
    setRisposte([...partiDi(t)]);
  };
  return {
    tipo, chosen, effective, value, risposte, mancanti, incoerenze, resta: macchinaResta(tipo, value),
    rif: chosen?.rifacimento === true, choose, answer, rifacimento, esempio, setCollaudo: (c: Collaudo) => setChosen(c),
  };
}
