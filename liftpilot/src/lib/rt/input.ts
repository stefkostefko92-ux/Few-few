// What the engineer enters for a relazione tecnica di modifica (RT plan §3.2): the document (day, job, description of
// the modification, layout changed, first-page note), the revision's note, the signatures («Redatto da», «Verificato
// da»: an engineer with the Ordine's province and number — owner's decision 3), the answers about the building's
// structures, the sections added by hand with their reason, the component data (input-componenti.ts), the files in
// their order and which file is which expected document. One shape, built twice: `rtDraftSchema` keeps what is being
// typed (FormDraft scope 'rt'), `rtInputsSchema` is the issue's — strict, with what the issue cannot do without
// (mancantiEmissione) and the sources of the component data. What needs the base or the database (the day against the
// calculation's, the files of this project, the regime, the structures' answers asked) the server checks at issue.
// Pure.
import { z } from 'zod';
import { DOCUMENTO_IDS, SEZIONE_KEYS, COMPONENTI, type MancanteRt } from './types';
import { plainText } from '../allegati/kinds';
import { allegatoIdSchema, senzaVuoti, testo } from './fonte';
import { componentiSchemaDi, fontiMancanti } from './input-componenti';

/** At most this many files in an RT (the attachments' limits, src/lib/allegati/limits.ts, say the same). */
export const RT_MAX_ALLEGATI = 40;
/** The titles of the engineer who verifies (owner's decision 3: engineers only). */
export const TITOLI_VERIFICATORE = ['Ing.', 'Dott. Ing.'] as const;
/** The number of registration with the Ordine. */
export const NUMERO_ORDINE = /^[A-Za-z0-9/.-]{1,20}$/;

/** A real calendar day YYYY-MM-DD. */
export const giornoValido = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
/** The RT's day at issue: a real day, not after `oggi` (Italy's day) nor before the base calculation's `minimo`. */
export const dataRtValida = (s: string, oggi: string, minimo: string): boolean => giornoValido(s) && s <= oggi && s >= minimo;

const unici = <T>(xs: readonly T[], key: (x: T) => string): boolean => new Set(xs.map(key)).size === xs.length;

function rtShape(bozza: boolean) {
  return {
    doc: z.object({
      data: z.string().refine(giornoValido, { message: 'data' }),
      commessa: testo(1, 40, bozza),
      descrizione: testo(20, 4000, bozza),
      layoutModificato: z.boolean(),
      notaLayout: testo(1, 500, bozza),
      nota: testo(1, 600, bozza),
    }).partial().strict(),
    revisione: z.object({ testo: testo(3, 120, bozza) }).partial().strict(),
    firme: z.object({
      redatto: z.object({ nome: testo(2, 120, bozza), qualifica: testo(1, 80, bozza) }).partial().strict(),
      verificato: z.object({
        titolo: z.enum(TITOLI_VERIFICATORE), nome: testo(2, 120, bozza), provincia: testo(2, 40, bozza),
        numero: z.string().trim().regex(NUMERO_ORDINE), sezione: z.enum(['A', 'B']),
      }).partial().strict(),
    }).partial().strict(),
    strutture: z.object({ forze: z.enum(['aumentano', 'non_aumentano']), pertinente: z.boolean() }).partial().strict(),
    sezioniManuali: z.array(z.object({ key: z.enum(SEZIONE_KEYS), motivo: testo(3, 300, bozza) }).strict()).max(SEZIONE_KEYS.length)
      .refine((xs) => unici(xs, (x) => x.key), { message: 'sezioneDoppia' }),
    componenti: componentiSchemaDi(bozza),
    // a file's title in the RT is stamped on its pages: one line, without control or direction characters (as an upload's)
    allegati: z.array(z.object({ attachmentId: allegatoIdSchema, titolo: z.string().transform(plainText).pipe(testo(1, 160, bozza)).optional(),
      componente: z.enum(COMPONENTI).optional() }).strict())
      .max(RT_MAX_ALLEGATI).refine((xs) => unici(xs, (x) => x.attachmentId), { message: 'allegatoDoppio' }),
    documenti: z.record(z.enum(DOCUMENTO_IDS), z.union([allegatoIdSchema, z.literal('separato')])),
  };
}

const rtObject = (bozza: boolean) => z.object(rtShape(bozza)).partial().strict();
export type RtInputs = z.infer<ReturnType<typeof rtObject>>;

/** What the issue cannot do without in the inputs: the description, the two signatures (the engineer's title, name,
 *  province and number), the sources of the component data entered. Blocking. The day, when missing, is the issue's
 *  (Italy's day: the server fills it before validating). */
export function mancantiEmissione(x: RtInputs): MancanteRt[] {
  const r = x.firme?.redatto, v = x.firme?.verificato, d = x.doc;
  const campi: [MancanteRt['dove'], string, boolean][] = [
    ['doc', 'doc.descrizione', (d?.descrizione?.length ?? 0) < 20],
    ['firme', 'firme.redatto.nome', (r?.nome?.length ?? 0) < 2],
    ['firme', 'firme.verificato.titolo', !v?.titolo], ['firme', 'firme.verificato.nome', (v?.nome?.length ?? 0) < 2],
    ['firme', 'firme.verificato.provincia', (v?.provincia?.length ?? 0) < 2], ['firme', 'firme.verificato.numero', !v?.numero],
  ];
  return [
    ...campi.filter(([, , manca]) => manca).map(([dove, campo]) => ({ dove, campo, bloccante: true })),
    ...fontiMancanti(x.componenti).map(({ sezione, campo }): MancanteRt => ({ dove: sezione, campo, bloccante: true })),
  ];
}

/** The draft of the RT's form: what is being typed, within the ranges (an empty field is a missing one). */
export const rtDraftSchema = z.preprocess(senzaVuoti, rtObject(true));

/** The inputs of an RT at issue: strict, with the minimum lengths, and refused while something it cannot do without is
 *  missing (one issue per field, at its path). */
export const rtInputsSchema = z.preprocess(senzaVuoti, rtObject(false).superRefine((x, ctx) => {
  for (const m of mancantiEmissione(x)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: m.campo.split('.'), message: 'richiesto' });
}));
