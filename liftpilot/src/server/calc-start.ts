import 'server-only';
// Where «Calcolo argano» starts (round 45), for every installation: the calculation asked for (?from=, any of the
// project's — a «Nuovo calcolo da questo»), else the form's draft, else the project's latest step-2 calculation, else its
// latest calculation of any provenance (a whole project before round 45: its lift design's), else empty
// (src/lib/calc-blank.ts). With the values come the type of intervention, the test as chosen and the parts answered:
// the type declared with the record, else read by its shape (interventoDi); a calculation saved with its type had every
// part answered, one before only its «Sì». Started from a lift design's calculation, the values are those it derived
// but the extra bends as entered on the design (the derived ones count the head pulleys of a machine below, which the
// drawing adds again: never copied), the test the design's, and the travel, the rope beyond it, the diverting pulley and
// the head pulleys' height are marked «dal progetto». The calculation's context is the type's.
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { blankCalc } from '@/lib/calc-blank';
import { formValuesSchema } from '@/lib/calc-input';
import { prisma } from '@/lib/db';
import { calcDraftSchema } from '@/lib/draft-input';
import { collaudoReadSchema, liftInputsReadSchema } from '@/lib/lift-input';
import { contestoDi, interventoDi, interventoTo, type TipoIntervento } from '@/lib/lift/intervento';
import type { Collaudo } from '@/lib/lift/collaudo';
import { risposteIniziali, sceltaSalvata } from '@/lib/lift/risposte';
import type { InterventoInit } from '@/components/calc/useIntervento';
import type { Partenza } from './collega/forms';
import { STEP2 } from './calcolo-base';
import { readDraft } from './drafts';

export interface CalcStart {
  values: FormValues;
  intervento: InterventoInit;
  /** how the linked survey may seed it (src/server/collega/forms.ts) */
  mode: Partenza;
  /** the draft it resumes */
  draft: { at: string; rilievo?: readonly string[]; parte?: boolean } | null;
  /** a lift design's calculation it starts from: the drawing's day and the values it gave */
  progetto: { at: Date; valori: Record<string, string> } | null;
}

const SOURCE = { inputs: true, collaudo: true, intervento: true, liftDesign: { select: { inputs: true, createdAt: true } } } as const;

/** The type, the test and the answers a start carries; the values in the type's context. */
function withType(values: FormValues, tipo: TipoIntervento | null, chosen: Collaudo | null, risposte: InterventoInit['risposte'] | null, dichiarato: boolean) {
  if (!tipo) return { values, intervento: { tipo, collaudo: chosen, risposte: [] } };
  const collaudo = chosen ?? interventoTo(tipo).collaudo;
  const V = { ...values, context: contestoDi(tipo), ...(tipo === 'TRASFORMAZIONE_COMPLETA' ? { compare: false, keepD: false } : {}) };
  return { values: V, intervento: { tipo, collaudo, risposte: risposte ?? risposteIniziali(tipo, collaudo, dichiarato) } };
}

export async function calcStart(user: SessionUser, projectId: string, fromId: string | null): Promise<CalcStart> {
  const draft = fromId ? null : await readDraft(user, projectId, 'calc', calcDraftSchema);
  if (draft) {
    const d = draft.data, chosen = d.collaudo ?? null;
    // a draft before round 45 has no type: read by its shape (its context was the replacement's or a new lift's); one
    // whose type is still to choose has no context yet
    const tipo = d.intervento ?? (d.values.context === 'repl' || d.values.context === 'new' ? interventoDi(d.values.context, chosen) : null);
    return { ...withType(d.values, tipo, chosen, d.risposte ?? null, false), mode: 'draft', draft: { at: draft.at, rilievo: d.rilievo, parte: d.parte }, progetto: null };
  }
  const where = { projectId, companyId: user.companyId };
  const c = await prisma.calculation.findFirst({ where: { ...where, ...(fromId ? { id: fromId } : STEP2) }, orderBy: { createdAt: 'desc' }, select: SOURCE })
    ?? (fromId ? null : await prisma.calculation.findFirst({ where, orderBy: { createdAt: 'desc' }, select: SOURCE }));
  const parsed = c ? formValuesSchema.safeParse(c.inputs) : null;
  if (!c || !parsed?.success) return { ...withType(blankCalc(), null, null, null, false), mode: 'new', draft: null, progetto: null };
  let values: FormValues = parsed.data, chosen: Collaudo | null = null, progetto: CalcStart['progetto'] = null;
  const raw = c.collaudo ? collaudoReadSchema.safeParse(c.collaudo) : null;
  const L = c.liftDesign ? liftInputsReadSchema.safeParse(c.liftDesign.inputs) : null;
  if (c.liftDesign && L?.success) {
    values = { ...values, nps: L.data.calc.nps ?? 0 };
    chosen = L.data.collaudo ?? null;
    const keys = ['H', 'L0', ...(values.layout === 'topDefl' ? ['dx', 'h'] : []), ...(values.layout === 'bottom' ? ['Hv'] : [])];
    progetto = { at: c.liftDesign.createdAt, valori: Object.fromEntries(keys.filter((k) => values[k] !== undefined && values[k] !== '').map((k) => [k, String(values[k])])) };
  } else if (raw?.success) {
    // a test stored with its type is the normalised one: the load the documented loads give is the rule's, not an answer
    chosen = c.intervento ? sceltaSalvata(values, raw.data) : raw.data;
  }
  const tipo = c.intervento ?? interventoDi(values.context, chosen ?? (raw?.success ? raw.data : null));
  return { ...withType(values, tipo, chosen, null, c.intervento !== null), mode: null, draft: null, progetto };
}
