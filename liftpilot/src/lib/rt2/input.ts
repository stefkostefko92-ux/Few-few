// What the engineer enters for an RT after the owner's model (round 52): the first page's data nothing else holds
// (manufacturer, authorised users, the year and the company of the work, the job, the description of the modification,
// the cover's text; before: the roping and the machine room, after: the drive, persons, stops and area when they
// change), the components added, each component's inputs (its fields: componenti/*.ts), the documents declared attached,
// the files, the signatures («Redatto da», «Verificato da»: an engineer — owner's decision 3) and the revision's note.
// One shape, built twice: the draft keeps what is typed, the issue's is strict. Pure.
import { z } from 'zod';
import { allegatoIdSchema, senzaVuoti, testo } from '../rt/fonte';
import { giornoValido, NUMERO_ORDINE, RT_MAX_ALLEGATI, TITOLI_VERIFICATORE } from '../rt/input';
import { plainText } from '../allegati/kinds';
import { ALLEGATI_RT2 } from './allegati';
import { schemaDati } from './campi';
import { MODULI } from './componenti';
import { COMPONENTI_RT2, type ComponenteRt2, type DatiRt2 } from './types';

const unici = <T>(xs: readonly T[], key: (x: T) => string): boolean => new Set(xs.map(key)).size === xs.length;
const centesimi = (x: number): boolean => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;

const datiSchema = (): z.ZodType<Partial<Record<ComponenteRt2, DatiRt2>>> => {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of COMPONENTI_RT2) {
    const m = MODULI[c];
    if (m) shape[c] = schemaDati(m.campi).optional();
  }
  return z.object(shape).strict() as unknown as z.ZodType<Partial<Record<ComponenteRt2, DatiRt2>>>;
};

function rt2Shape(bozza: boolean) {
  return {
    doc: z.object({
      data: z.string().refine(giornoValido, { message: 'data' }),
      commessa: testo(1, 40, bozza),
      costruttore: testo(1, 80, bozza),
      utentiEsperti: z.enum(['si', 'no']),
      annoRealizzazione: z.string().trim().regex(/^\d{4}$/),
      ascensorista: testo(2, 160, bozza),
      componentiModificati: testo(20, 4000, bozza),
      testoCopertina: testo(1, 600, bozza),
    }).partial().strict(),
    tecnici: z.object({
      prima: z.object({ r: z.union([z.literal(1), z.literal(2), z.literal(4)]), locale: z.enum(['alto', 'basso']), azionamento: z.enum(['1v', '2v', 'vvvf']) }).partial().strict(),
      dopo: z.object({
        azionamento: z.enum(['1v', '2v', 'vvvf']), capienza: z.number().int().min(1).max(100), fermate: z.number().int().min(2).max(60),
        superficie: z.number().finite().min(0.1).max(20).refine(centesimi),
      }).partial().strict(),
    }).partial().strict(),
    aggiunti: z.array(z.enum(COMPONENTI_RT2)).max(COMPONENTI_RT2.length).refine((xs) => unici(xs, (x) => x), { message: 'componenteDoppio' }),
    dati: datiSchema(),
    dichiarati: z.object(Object.fromEntries(ALLEGATI_RT2.map((a) => [a, z.boolean()]))).partial().strict(),
    allegati: z.array(z.object({ attachmentId: allegatoIdSchema, titolo: z.string().transform(plainText).pipe(testo(1, 160, bozza)).optional() }).strict())
      .max(RT_MAX_ALLEGATI).refine((xs) => unici(xs, (x) => x.attachmentId), { message: 'allegatoDoppio' }),
    firme: z.object({
      redatto: z.object({ nome: testo(2, 120, bozza), qualifica: testo(1, 80, bozza) }).partial().strict(),
      verificato: z.object({
        titolo: z.enum(TITOLI_VERIFICATORE), nome: testo(2, 120, bozza), provincia: testo(2, 40, bozza),
        numero: z.string().trim().regex(NUMERO_ORDINE), sezione: z.enum(['A', 'B']),
      }).partial().strict(),
    }).partial().strict(),
    revisione: z.object({ testo: testo(3, 120, bozza) }).partial().strict(),
  };
}

const rt2Object = (bozza: boolean) => z.object(rt2Shape(bozza)).partial().strict();
export type Rt2Inputs = z.infer<ReturnType<typeof rt2Object>>;

/** The draft of the RT's form (an empty field is a missing one). */
export const rt2DraftSchema = z.preprocess(senzaVuoti, rt2Object(true));
/** The inputs at issue: strict, with the minimum lengths; what is missing to issue is the derivation's (derive.ts). */
export const rt2InputsSchema = z.preprocess(senzaVuoti, rt2Object(false));
