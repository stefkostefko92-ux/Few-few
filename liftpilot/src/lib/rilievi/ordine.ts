// The order of the sheet's sections (without a database — tested alone): «Impianto» is the identification of the plant
// and its plate — always first; the others are ordered per company (`Company.ordineSezioni`, set on the company page by
// whoever has 'company:edit', src/server/rilievi/sezioni-actions.ts). Empty — the order of fields.ts. It holds for the
// form, the sheet's page, the print and the PDF. A section added later (a stored order without it — «Centralina» since
// round 49) comes last, as in rilievi. Ported 1:1 from rilievi (src/schede/ordine.ts, commit 988f3cf37).
import { z } from 'zod';
import { SECTIONS, type SectionKey } from './fields';

export const FISSE: readonly SectionKey[] = ['impianto'];
export const ORDINABILI: readonly SectionKey[] = SECTIONS.map((s) => s.key).filter((key) => !FISSE.includes(key));

const isOrdinabile = (key: unknown): key is SectionKey => typeof key === 'string' && (ORDINABILI as readonly string[]).includes(key);

/**
 * The stored order, cleaned: only the known sections, each once; the sections that are not in it (a new section after the
 * save) come last — in the default order.
 */
export function ordineEffettivo(saved: readonly string[]): SectionKey[] {
  const out = new Set<SectionKey>();
  for (const key of saved) if (isOrdinabile(key)) out.add(key);
  for (const key of ORDINABILI) out.add(key);
  return [...out];
}

/** The sections (of fields.ts or already for display) in the company's order: the identification, then the ordered. */
export function sezioniOrdinate<T extends { key: SectionKey }>(sections: readonly T[], saved: readonly string[]): T[] {
  const rank = new Map([...FISSE, ...ordineEffettivo(saved)].map((key, i) => [key, i]));
  return [...sections].sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
}

/** A section that can be moved (the fixed ones cannot). */
const Ordinabile = z.enum(ORDINABILI as [SectionKey, ...SectionKey[]]);

/** The order sent: exactly the sections to order, each once. */
const OrdineInviato = z.array(Ordinabile).length(ORDINABILI.length).refine((list) => new Set(list).size === list.length);

/** The order sent — otherwise null (a forged form). */
export function parseOrdine(raw: unknown): SectionKey[] | null {
  const sent = OrdineInviato.safeParse(raw);
  return sent.success ? sent.data : null;
}

export type Verso = 'su' | 'giu';

/** A section's «up/down» button: «funi:su» / «funi:giu» — the first two parts, as rilievi reads it
 *  (`const [key, verso] = raw.split(':')`): what comes after a further «:» is ignored («funi:su:x» moves «funi» up). */
const MossaInviata = z.string().transform((raw) => raw.split(':')).pipe(z.tuple([Ordinabile, z.enum(['su', 'giu'])]).rest(z.string()));

/** A section's «up/down» button — otherwise null. */
export function parseMossa(raw: unknown): { key: SectionKey; verso: Verso } | null {
  const sent = MossaInviata.safeParse(raw);
  return sent.success ? { key: sent.data[0], verso: sent.data[1] } : null;
}

/** One step up or down; at the edge — no change. */
export function sposta(ordine: readonly SectionKey[], key: SectionKey, verso: Verso): SectionKey[] {
  const out = [...ordine];
  const from = out.indexOf(key);
  const to = verso === 'su' ? from - 1 : from + 1;
  const other = out[to];
  if (from < 0 || other === undefined) return out;
  out[to] = key;
  out[from] = other;
  return out;
}

/** Whether an order is the default one — then the company keeps it empty (a future section takes its own place). */
export const ordinePredefinito = (ordine: readonly SectionKey[] | null): boolean => ordine === null || ordine.every((key, i) => key === ORDINABILI[i]);

/**
 * The sections of the sheet's print and PDF: without the identification — it is in the head band and in the plate — and
 * without the ones the sheet leaves out (the choice at the end of the form, `sezioniEscluse`).
 */
export function sezioniStampate<T extends { key: SectionKey }>(sections: readonly T[], escluse: readonly string[]): T[] {
  return sections.filter((section) => !FISSE.includes(section.key) && !escluse.includes(section.key));
}
