// The suppliers' modules — their official blank PDFs (assets/moduli/) and the map of their fields (the JSON next to
// each PDF): the boxes and lines of Pelazza in points, the names of the fields of Montanari's form. The PDF that comes
// out is the original itself with our values on it, so the PDF is pinned by SHA-256 (src/server/rilievi/moduli-pdf.ts):
// another version of the module means other coordinates. This file is pure (the maps are imported and checked here,
// in the browser too); reading the PDFs is the server's. Ported 1:1 from rilievi (src/ordini/moduli.ts).
import { z } from 'zod';
import pelazzaMap from '../../../../assets/moduli/pelazza-ordine-quadri-032026.json';
import montanariMap from '../../../../assets/moduli/montanari-richiesta-preventivo-argani-ita.json';

/** Where a field's prefilled value comes from (prefill.ts on the server, prefill-client.ts in the browser). */
export const PREFILL_TOKENS = [
  'data',
  'rif',
  'azienda',
  'utente',
  'ruolo',
  'email',
  'accessi',
  'fermate',
  'portataKg',
  'funiNumero',
  'funiDiametroMm',
  'pattinoRetrattileNumero',
  'operatoreMarca',
] as const;
export type PrefillToken = (typeof PREFILL_TOKENS)[number];

/** A tick from the survey: "field=VALUE" (door type, lift type, machine position). */
const CHECK_PREFILL = /^(tipoPorte|tipoImpianto|ubicazioneMacchina)=[A-Z]+$/;

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
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    /** The line: from x0 to x1, on the rule at height y (from the top). */
    line: z.tuple([num, num, num]),
  }),
  z.object({ ...base, kind: z.literal('textarea'), prefill: textPrefill, maxLength, area: z.tuple([num, num, num, num]) }),
]);

const acroField = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('check'), prefill: checkPrefill, acro: z.string().min(1) }),
  z.object({ ...base, kind: z.literal('text'), prefill: textPrefill, maxLength, acro: z.string().min(1) }),
  z.object({ ...base, kind: z.literal('textarea'), prefill: textPrefill, maxLength, acro: z.string().min(1) }),
]);

function moduloSchema<F extends z.ZodTypeAny, T extends string>(field: F, tipo: T) {
  return z.object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    fornitore: z.string().min(1),
    titolo: z.string().min(1),
    fonte: z.string().url(),
    file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    tipo: z.literal(tipo),
    gruppi: z.array(
      z.object({
        titolo: z.string().min(1),
        righe: z.array(
          z.object({
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
  const keys = fieldsOf(map as Modulo).map((field) => field.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${name}: a field key repeats`);
  return map;
}

export const PELAZZA: ModuloOverlay = load('pelazza-ordine-quadri-032026.json', pelazzaMap, moduloSchema(overlayField, 'overlay'));
export const MONTANARI: ModuloAcro = load('montanari-richiesta-preventivo-argani-ita.json', montanariMap, moduloSchema(acroField, 'acroform'));
