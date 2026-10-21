import 'server-only';
// What the workspace shows of a relazione tecnica di modifica while it is prepared (RT plan §7, cards 3–5), from the
// same derivation the document prints (compose.ts): the sections with why each is in (and those the engineer may add),
// the checks of each section as the document's rows (label, value, limit, outcome, clause), what is missing (blocking or
// to confirm), the expected documents with their state, the structures' questions, the regime, the verdict — plain JSON
// for the client. And what the issue asks to confirm: the checks not satisfied, the data missing, the documents still to
// attach (none of them blocks: the engineer signs).
import { contestoDoc } from '@/lib/report/rt/contesto';
import type { RtDocInput } from '@/lib/report/rt/build';
import { esitoDi, rigaVerifica } from '@/lib/report/rt/righe';
import { statoDocumento } from '@/lib/report/rt/sezione';
import { DOC, campo } from '@/lib/report/rt/testi';
import { CAMPI } from '@/lib/rt/componenti/punti';
import { regime as regimeDi } from '@/lib/rt/regimi';
import { SEZIONI, contestoOf, disponibile, titoloSezione } from '@/lib/rt/sezioni';
import type { AllegatoKind, Componente, DocumentoId, RegimeKey, RtDerived, RtVerdict, SezioneKey } from '@/lib/rt/types';
import type { BlockStatus } from '@/lib/report/model';

export interface RigaSummary { label: string; valore: string; limite: string; esito: string; ref: string; stato: BlockStatus }

export interface RtSummary {
  path: 'locale' | 'vano';
  norma: '10411-1' | '10411-11';
  sezioni: { key: SezioneKey; titolo: string; automatica: boolean; motivi: { testo: string; clausola: string }[] }[];
  /** sections the engineer may add with a reason (the rule does not bring them; the path has them) */
  aggiungibili: { key: SezioneKey; titolo: string }[];
  verifiche: { key: SezioneKey; righe: RigaSummary[] }[];
  mancanti: { campo: string; testo: string; bloccante: boolean }[];
  documenti: { id: DocumentoId; titolo: string; clausola: string; stato: 'allegato' | 'separato' | 'da_allegare'; testo: string; consigliato: boolean;
    kind: AllegatoKind; componente: Componente; scelto: boolean }[];
  strutture: { esito: RtDerived['strutture']['esito']; domande: ('forze' | 'pertinente')[]; documento: boolean };
  regime: { legge: RegimeKey | null; sigla: string | null; origine: 'scelta' | 'anno' | null; confermata: boolean; coerente: boolean; emettibile: boolean };
  esito: { verdict: RtVerdict; failCount: number; warnCount: number };
}

/** The summary of a derivation, with the document's input it was built from (its words come from the builder). */
export function summaryOf(input: RtDocInput): RtSummary {
  const d = input.derived, x = contestoDoc(input, DOC.sezioni), ctx = contestoOf(d.base), auto = new Set(d.sezioni.filter((s) => s.automatica).map((s) => s.key));
  const inRt = new Set(d.sezioni.map((s) => s.key));
  return {
    path: d.path, norma: d.norma,
    sezioni: d.sezioni.map((s) => ({ key: s.key, titolo: titoloSezione(s.key), automatica: s.automatica, motivi: s.motivi.map((m) => ({ testo: m.testo, clausola: m.clausola })) })),
    aggiungibili: SEZIONI.filter((s) => !auto.has(s.key) && disponibile(s.key, ctx)).map((s) => ({ key: s.key, titolo: s.titolo })),
    verifiche: SEZIONI.filter((s) => inRt.has(s.key)).map((s) => ({ key: s.key, righe: d.checks.filter((c) => c.sezione === s.key).map((c) => {
      const [label = '', valore = '', limite = '', esito = '', ref = ''] = rigaVerifica(x, c);
      return { label, valore, limite, esito, ref, stato: esitoDi(c).status };
    }) })).filter((v) => v.righe.length),
    mancanti: [...new Map(d.mancanti.map((m) => [m.campo, { campo: m.campo, testo: campo(m.campo, CAMPI), bloccante: m.bloccante }])).values()],
    documenti: d.documenti.map((o) => ({ id: o.id, titolo: o.titolo, clausola: o.clausola, stato: o.stato, testo: statoDocumento(o), consigliato: o.consigliato,
      kind: o.kind, componente: o.componente, scelto: !!o.allegato?.scelto })),
    strutture: { esito: d.strutture.esito, domande: [...d.strutture.domande], documento: d.strutture.documento },
    regime: { ...d.regime, sigla: d.regime.legge ? regimeDi(d.regime.legge).sigla : null },
    esito: { verdict: d.verdict, failCount: d.failCount, warnCount: d.warnCount },
  };
}

/** What the issue lists for the engineer to confirm: checks not satisfied, data missing (not blocking), documents to
 *  attach. Empty: nothing to confirm. */
export interface Conferma { falliti: string[]; mancanti: string[]; documenti: string[] }

export function confermaOf(s: RtSummary): Conferma {
  const titolo = new Map(s.sezioni.map((x) => [x.key, x.titolo]));
  return {
    falliti: s.verifiche.flatMap((v) => v.righe.filter((r) => r.stato === 'fail').map((r) => `${titolo.get(v.key) ?? v.key}: ${r.label}`)),
    mancanti: s.mancanti.filter((m) => !m.bloccante).map((m) => m.testo),
    documenti: s.documenti.filter((o) => o.stato === 'da_allegare' && !o.consigliato).map((o) => o.titolo),
  };
}

export const daConfermare = (c: Conferma): boolean => c.falliti.length + c.mancanti.length + c.documenti.length > 0;
