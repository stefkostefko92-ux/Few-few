// A component section of the relazione tecnica di modifica (RT plan §5.1, 7…): the same sub-blocks in every section, so
// that the engineer always knows where to look — a. why it is in the RT (each reason with its clause, or the engineer's
// own), b. the component's data with their state and source, c. the checks (Verifica · Valore · Limite · Esito ·
// Riferimento, with their notes), d. the obligations of the standard, e. the points to verify on site, f. the expected
// documents (attached «Allegato n», delivered separately or still to attach). A section's own blocks (the machine room's
// survey, the D.1 tables, the shaft's plan) go after its reasons (`prima`) or after its checks (`dopo`). Pure.
import { DOCUMENTI } from '../../rt/documenti';
import { titoloSezione } from '../../rt/sezioni';
import type { DatoComponente, DocumentoRt, Motivo, SezioneKey, SezioneRt } from '../../rt/types';
import type { PuntoInSito } from '../../lift/punti';
import type { ReportBlock } from '../model';
import { mergeRefs } from '../refs';
import type { Ctx } from './contesto';
import { esitoDi, noteDi, rigaVerifica } from './righe';
import { DOC, elenco, fill, fonte, maiuscola, perDocumento, punto, valore } from './testi';

/** A reason in words. */
export const motivoText = (m: Motivo): string => (m.tipo === 'manuale' ? fill(DOC.motivi.manuale, { testo: m.testo })
  : fill(DOC.motivi[m.tipo], { testo: m.tipo === 'parte' ? m.testo : maiuscola(m.testo), clausola: m.clausola }));

const DATI: Readonly<Record<string, string>> = DOC.dati;

/** A datum of a component as the grid prints it: Dato · Valore · Stato · Fonte. */
export function rigaDato(x: Ctx, v: DatoComponente): string[] {
  const val = typeof v.valore === 'number' ? `${x.fmt(v.valore, v.dec)}${v.unit ? ` ${v.unit}` : ''}` : v.valore === null ? '—' : valore(v.valore);
  return [DATI[v.voce] ?? v.voce, val, v.stato === 'nuovo' ? DOC.componente.nuovo : DOC.componente.esistente, fonte(v.fonte, v.allegato)];
}

/** The state of an expected document in words. */
export const statoDocumento = (d: DocumentoRt): string => (d.stato === 'allegato' && d.allegato ? fill(DOC.documenti.allegato, { n: d.allegato.position })
  : d.stato === 'separato' ? DOC.documenti.separato : DOC.documenti.daAllegare);

/** The section an expected document is printed in: the first of its components that is in the RT (none: only the
 *  list of «Documenti allegati» names it). */
export function sezioneDocumento(d: DocumentoRt, sezioni: readonly SezioneKey[]): SezioneKey | null {
  const comp = DOCUMENTI.find((x) => x.id === d.id)?.componenti ?? [d.componente];
  return sezioni.find((s) => comp.some((c) => c === s)) ?? null;
}

/** The documents of a section, each «titolo (clausola): stato». */
export const documentiDi = (x: Ctx, k: SezioneKey): string[] => x.d.documenti.filter((d) => sezioneDocumento(d, x.sezioni) === k)
  .map((d) => fill(DOC.documenti.riga, { titolo: d.titolo, clausola: d.clausola, stato: statoDocumento(d) }) + (d.consigliato ? DOC.documenti.consigliato : ''));

/** The points with the same words once, their clauses merged (two checks missing the same datum). */
export function unisci(ps: readonly PuntoInSito[]): PuntoInSito[] {
  const per = new Map<string, PuntoInSito[]>();
  for (const p of ps) per.set(p.testo, [...(per.get(p.testo) ?? []), p]);
  return [...per.values()].map((g) => (g.length < 2 ? g[0] as PuntoInSito : { ...g[0] as PuntoInSito, rif: mergeRefs(g.flatMap((p) => perDocumento(p.rif))) }));
}

export interface Extra {
  /** after the reasons */
  prima?: ReportBlock[];
  /** after the checks */
  dopo?: ReportBlock[];
}

export function sezioneBlocks(x: Ctx, s: SezioneRt, extra: Extra = {}): ReportBlock[] {
  const S = DOC.sub, k = s.key, B: ReportBlock[] = [x.h2(titoloSezione(k))];
  B.push({ t: 'h3', text: S.perche }, { t: 'list', items: s.motivi.map(motivoText) });
  B.push(...(extra.prima ?? []));

  const comp = x.d.componenti.find((c) => c.sezione === k);
  B.push({ t: 'h3', text: S.dati });
  if (comp) B.push({ t: 'p', text: DOC.componente.stati[comp.stato] });
  if (comp?.dati.length) {
    B.push({ t: 'grid', head: DOC.componente.head, rows: comp.dati.map((v) => rigaDato(x, v)), widths: [0.36, 0.22, 0.12, 0.3], align: ['l', 'r', 'l', 'l'] });
  } else B.push({ t: 'p', style: 'note', text: DOC.componente.nessunDato });

  const checks = x.d.checks.filter((c) => c.sezione === k);
  B.push({ t: 'h3', text: S.verifiche });
  if (checks.length) {
    B.push({ t: 'grid', head: DOC.verifiche.head, rows: checks.map((c) => rigaVerifica(x, c)), status: checks.map((c) => esitoDi(c).status), statusCol: 3,
      widths: [0.33, 0.12, 0.14, 0.14, 0.27], align: ['l', 'r', 'r', 'l', 'l'] });
    const note = noteDi(checks);
    if (note.length) B.push({ t: 'p', style: 'note', text: fill(DOC.verifiche.nota, { note: elenco(note) }) });
    if (checks.some((c) => c.ambito === 'esistente' && !c.mancanti?.length)) B.push({ t: 'p', style: 'note', text: DOC.verifiche.esistenteNota });
    if (checks.some((c) => c.mancanti?.length)) B.push({ t: 'p', style: 'note', text: DOC.verifiche.mancantiNota });
  } else B.push({ t: 'p', style: 'note', text: DOC.verifiche.nessuna });
  B.push(...(extra.dopo ?? []));

  const punti = x.d.punti.filter((p) => p.sezione === k);
  const obblighi = punti.filter((p) => p.tipo === 'obbligo').map((p) => punto(p.punto)), sito = unisci(punti.filter((p) => p.tipo === 'sito').map((p) => p.punto)).map(punto);
  if (obblighi.length) B.push({ t: 'h3', text: S.obblighi }, { t: 'list', items: obblighi });
  if (sito.length) B.push({ t: 'h3', text: S.sito }, { t: 'list', items: sito });
  const docs = documentiDi(x, k);
  B.push({ t: 'h3', text: S.documenti }, docs.length ? { t: 'list', items: docs } : { t: 'p', style: 'note', text: DOC.documenti.nessuno });
  return B;
}
