// The suppliers' modules — their official blank PDFs (assets/moduli/) and the map of their fields (the JSON next to each
// PDF): the boxes and lines of the flat sheets in points (Pelazza, the argano data sheet, 2SG), the names of the fields of
// MoviLift's form. The PDF that comes out is the original itself with our values on it, so the PDF is pinned by SHA-256
// (src/server/rilievi/moduli-pdf.ts): another version of the module means other coordinates. Where each blank module comes
// from — `fonte` in its map (MoviLift — the copy without the encryption; the argano sheet — a Word file converted to PDF;
// 2SG and the two Mastech sheets — scanned). This file is pure (the maps are imported and checked here); reading the PDFs
// is the server's. Ported 1:1 from rilievi (src/ordini/moduli.ts, commit 988f3cf37).
import { z } from 'zod';
import pelazzaMap from '../../../../assets/moduli/pelazza-ordine-quadri-032026.json';
import arganiMap from '../../../../assets/moduli/rilievo-dati-argani.json';
import moviliftMap from '../../../../assets/moduli/movilift-modulo-ordine-scelta-v2-6.json';
import sgMap from '../../../../assets/moduli/2sg-ordine-porte.json';
import mastechNg120Map from '../../../../assets/moduli/mastech-ng120.json';
import mastechQiMap from '../../../../assets/moduli/mastech-qi-touch.json';

/**
 * Where the prefilled value of a field that is in no link comes from (prefill.ts on the server, prefill-client.ts in the
 * browser — there it follows the sheet while typing too): the date, the lift's reference, the company and the person
 * writing, and the sheet's ticks as words. The plant data that stand in more than one place (stops, address, doors,
 * load, ropes…) are in collegamenti-elenco.ts — filled in every direction and compared.
 */
export const PREFILL_TOKENS = [
  'data',
  'rif',
  'azienda',
  'utente',
  'ruolo',
  'email',
  // the sheet's ticks as words ("Automatiche, Manuali", "Alto") — for a text field of a module
  'tipoImpianto',
  'tipoPorte',
  'ubicazioneMacchina',
] as const;
export type PrefillToken = (typeof PREFILL_TOKENS)[number];

/** A tick from the survey: "field=VALUE" (a retiring cam to change: Sì → MoviLift's «Elettr. Pattino»). */
const CHECK_PREFILL = /^pattinoRetrattile=si$/;

const num = z.number().finite();
const base = {
  key: z.string().regex(/^[a-z][A-Za-z0-9]{1,40}$/),
  label: z.string().min(1).max(120),
  /** On paper the field has no label of its own (a value next to a tick) — on the screen the label is hidden. */
  labelNascosta: z.literal(true).optional(),
};
const checkPrefill = z.string().regex(CHECK_PREFILL).optional();
const textPrefill = z.enum(PREFILL_TOKENS).optional();
const maxLength = z.number().int().min(1).max(600);

const overlayField = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('check'),
    prefill: checkPrefill,
    /** The inside of the box: x0, y0 (from the top), x1, y1 — in points. */
    box: z.tuple([num, num, num, num]),
    /** A circle around the printed word instead of a cross — NG120's floors are marked by their number. */
    segno: z.literal('cerchio').optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    /** The line: from x0 to x1, on the rule at height y (from the top). */
    line: z.tuple([num, num, num]),
  }),
  z.object({
    ...base,
    kind: z.literal('textarea'),
    prefill: textPrefill,
    maxLength,
    area: z.tuple([num, num, num, num]),
    /** The sheet has lines of its own (dotted) in the box: the text is written on them — their heights. */
    righe: z.array(num).min(2).optional(),
  }),
]);

/**
 * In a form: a tick, a text, a radio group (the options in the order of its buttons in the PDF, `widget`) and a drop-down
 * list (`vuoto` is the option "nothing chosen", e.g. «SCEGLI...»). `predefinito` is the blank module's value — the module
 * opens with it when nothing else fills it.
 */
const acroField = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('check'), prefill: checkPrefill, acro: z.string().min(1), predefinito: z.literal(true).optional() }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    acro: z.string().min(1),
    predefinito: z.string().min(1).optional(),
    /** The field has a button in a foreign place too (an error of the module: MoviLift's «Fossa» is also in the first box
     *  of «Piano Corto») — only this button comes out on the sheet. */
    widget: z.number().int().min(0).optional(),
    /** The field is not in the form but the sheet waits for it (MoviLift's «Fotocellula … V»): it is made at filling time
     *  — x, y (from the bottom), width and height in points, on the page of the field `come`, with its font, size and
     *  colour (src/server/rilievi/pdf-form.ts). */
    crea: z.object({ rect: z.tuple([num, num, num, num]), come: z.string().min(1) }).optional(),
  }),
  z.object({ ...base, kind: z.literal('textarea'), prefill: textPrefill, maxLength, acro: z.string().min(1) }),
  z.object({
    ...base,
    kind: z.literal('radio'),
    acro: z.string().min(1),
    opzioni: z
      .array(z.object({ valore: z.string().regex(/^[a-z][A-Za-z0-9]{0,30}$/), label: z.string().min(1).max(120), widget: z.number().int().min(0) }))
      .min(2),
    predefinito: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('select'),
    prefill: textPrefill,
    acro: z.string().min(1),
    opzioni: z.array(z.string().min(1).max(60)).min(1),
    vuoto: z.string().min(1),
  }),
]);

function moduloSchema<F extends z.ZodTypeAny, T extends string>(field: F, tipo: T) {
  return z.object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    /** The supplier («Pelazza Peppino»); the argano sheet is for every kind of machine — without a supplier. */
    fornitore: z.string().min(1).optional(),
    titolo: z.string().min(1),
    /** Where the blank module comes from: the supplier's address or how it came (uploaded by the owner). */
    fonte: z.string().min(1),
    file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    tipo: z.literal(tipo),
    /** The flat sheets: the size of the writing (8 pt by default) and how far above the line it stands. */
    dimensione: z.number().min(5).max(20).optional(),
    sopraLinea: z.number().min(0).max(5).optional(),
    /** The scanned sheet is upside down: the page is turned to come out upright (2SG). */
    ruota: z.literal(180).optional(),
    gruppi: z.array(
      z.object({
        titolo: z.string().min(1),
        /** The page of the sheet the group is on (QI Touch has two); without it — the first. */
        pagina: z.number().int().min(1).max(4).optional(),
        righe: z.array(
          z.object({
            /** The row's printed heading («Norme di riferimento»), when the ticks alone do not say what they are for
             *  («6V», «12V»): in the form it stands before them, in the summary before each. */
            titolo: z.string().min(1).max(80).optional(),
            campi: z.array(field).min(1),
            /** The arrow on paper: after this many fields of the row. */
            freccia: z.number().int().min(1).optional(),
          }),
        ),
      }),
    ),
  });
}

export type OverlayField = z.output<typeof overlayField>;
export type AcroField = z.output<typeof acroField>;
export type ModuloField = OverlayField | AcroField;
export type ModuloOverlay = z.output<ReturnType<typeof moduloSchema<typeof overlayField, 'overlay'>>>;
export type ModuloAcro = z.output<ReturnType<typeof moduloSchema<typeof acroField, 'acroform'>>>;
export type Modulo = ModuloOverlay | ModuloAcro;

/** The module's fields in the order of the document. */
export function fieldsOf(modulo: Modulo): ModuloField[] {
  return modulo.gruppi.flatMap((g) => g.righe.flatMap((r): ModuloField[] => r.campi));
}

function load<S extends z.ZodTypeAny>(name: string, json: unknown, schema: S): z.output<S> {
  const map: z.output<S> = schema.parse(json);
  const fields = fieldsOf(map as Modulo);
  const keys = fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${name}: a field key repeats`);
  for (const field of fields) {
    if (field.kind === 'radio') {
      const valori = field.opzioni.map((o) => o.valore);
      const widgets = field.opzioni.map((o) => o.widget);
      const ok = new Set(valori).size === valori.length && new Set(widgets).size === widgets.length
        && (field.predefinito === undefined || valori.includes(field.predefinito));
      if (!ok) throw new Error(`${name}: the radio ${field.key} is not whole`);
    }
    if (field.kind === 'text' && 'predefinito' in field && field.predefinito !== undefined && field.predefinito.length > field.maxLength) {
      throw new Error(`${name}: ${field.key} is too long`);
    }
  }
  return map;
}

export const PELAZZA: ModuloOverlay = load('pelazza-ordine-quadri-032026.json', pelazzaMap, moduloSchema(overlayField, 'overlay'));
export const ARGANI: ModuloOverlay = load('rilievo-dati-argani.json', arganiMap, moduloSchema(overlayField, 'overlay'));
export const MOVILIFT: ModuloAcro = load('movilift-modulo-ordine-scelta-v2-6.json', moviliftMap, moduloSchema(acroField, 'acroform'));
export const SG: ModuloOverlay = load('2sg-ordine-porte.json', sgMap, moduloSchema(overlayField, 'overlay'));
export const MASTECH_NG120: ModuloOverlay = load('mastech-ng120.json', mastechNg120Map, moduloSchema(overlayField, 'overlay'));
export const MASTECH_QI: ModuloOverlay = load('mastech-qi-touch.json', mastechQiMap, moduloSchema(overlayField, 'overlay'));

/** Every module, in the order rilievi checks them at the start (moduli-pdf.ts assertModuli). */
export const MODULI: readonly Modulo[] = [PELAZZA, MOVILIFT, ARGANI, SG, MASTECH_NG120, MASTECH_QI];

/** «Modulo ordine quadro (Scelta v2.6) · MoviLift» — without a supplier the title alone. */
export function nomeModulo(modulo: Pick<Modulo, 'titolo' | 'fornitore'>): string {
  return modulo.fornitore ? `${modulo.titolo} · ${modulo.fornitore}` : modulo.titolo;
}
