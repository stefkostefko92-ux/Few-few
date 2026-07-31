import { z } from 'zod';
import type { LocationKind, Material, MovementType, Uom } from '@prisma/client';

/**
 * Schemi di validazione del modulo Prodotti · Giacenze · Ubicazioni.
 *
 * Gli enum sono ripetuti come tuple di letterali (e non come `z.nativeEnum`)
 * perché questi schemi vengono importati anche dai form lato client: una tupla
 * `as const` resta un valore JavaScript puro, mentre `@prisma/client` a runtime
 * trascinerebbe il motore di query nel bundle del browser. Il `satisfies` fa
 * comunque fallire la compilazione se il dominio Prisma cambia.
 */

export const MATERIALI = [
  'ACCIAIO_ZINCATO',
  'ACCIAIO_INOX',
  'ACCIAIO_VERNICIATO',
  'ALLUMINIO',
  'GHISA',
  'ALTRO',
] as const satisfies readonly Material[];

export const UNITA_MISURA = ['PZ', 'MT', 'KG', 'CF'] as const satisfies readonly Uom[];

export const TIPI_UBICAZIONE = [
  'STOCCAGGIO',
  'RICEVIMENTO',
  'SPEDIZIONE',
  'QUARANTENA',
  'PRODUZIONE',
] as const satisfies readonly LocationKind[];

export const TIPI_MOVIMENTO = [
  'RICEVIMENTO',
  'PRELIEVO',
  'TRASFERIMENTO',
  'RETTIFICA',
  'RESO_CLIENTE',
  'RESO_FORNITORE',
  'INVENTARIO',
  'SPEDIZIONE',
  'SCARTO',
] as const satisfies readonly MovementType[];

/** Aliquote IVA italiane ammesse, in punti base. */
export const ALIQUOTE_IVA_BP = [2200, 1000, 500, 400] as const;

/** Stato di scorta usato dai filtri delle liste. */
export const STATI_SCORTA = ['tutti', 'sotto', 'esaurito', 'ok'] as const;
export type StatoScorta = (typeof STATI_SCORTA)[number];

export const statoScortaSchema = z.enum(STATI_SCORTA).catch('tutti');

// ─────────────────────────── Mattoni comuni ───────────────────────────

const testo = (max: number) => z.string().trim().max(max);

/** Campo di testo facoltativo: la stringa vuota del form diventa `null`. */
const testoOpzionale = (max: number) =>
  testo(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));

const interoNonNegativo = (etichetta: string) =>
  z
    .number({ invalid_type_error: `${etichetta}: inserire un numero intero.` })
    .int(`${etichetta}: sono ammessi solo numeri interi.`)
    .min(0, `${etichetta}: non può essere negativo.`);

const interoOpzionale = (etichetta: string) =>
  interoNonNegativo(etichetta)
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? null : v));

const identificativo = z.string().cuid('Identificativo non valido.');

/**
 * Riferimento facoltativo. La stringa vuota è ammessa PRIMA del controllo di
 * formato: il `<select>` vuoto del form invia `""`, che significa «nessuno» e
 * non «identificativo malformato».
 */
const identificativoOpzionale = z
  .union([identificativo, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === '' || v === null ? null : v));

// ─────────────────────────── Prodotti ───────────────────────────

export const prodottoCreaSchema = z
  .object({
    sku: testo(40).min(1, 'Lo SKU è obbligatorio.'),
    barcode: testoOpzionale(40),
    name: testo(200).min(2, 'Il nome deve avere almeno 2 caratteri.'),
    description: testoOpzionale(2000),
    categoryId: identificativo,
    material: z.enum(MATERIALI).default('ACCIAIO_ZINCATO'),
    finish: testoOpzionale(120),
    uom: z.enum(UNITA_MISURA).default('PZ'),
    weightGrams: interoNonNegativo('Peso').default(0),
    lengthMm: interoOpzionale('Lunghezza'),
    widthMm: interoOpzionale('Larghezza'),
    heightMm: interoOpzionale('Altezza'),
    thicknessMm: interoOpzionale('Spessore'),
    compatibility: testoOpzionale(500),
    brand: testoOpzionale(120),
    costCents: interoNonNegativo('Costo').default(0),
    priceCents: interoNonNegativo('Prezzo').default(0),
    vatRateBp: z
      .number()
      .int()
      .refine(
        (v) => (ALIQUOTE_IVA_BP as readonly number[]).includes(v),
        'Aliquota IVA non prevista.',
      )
      .default(2200),
    supplierId: identificativoOpzionale,
    minStock: interoNonNegativo('Scorta minima').default(0),
    maxStock: interoOpzionale('Scorta massima'),
    defaultLocationId: identificativoOpzionale,
    batchTracked: z.boolean().default(false),
    notes: testoOpzionale(2000),
    active: z.boolean().default(true),
  })
  .refine(
    (d) => d.maxStock === null || d.maxStock >= d.minStock,
    // Un massimo sotto il minimo renderebbe il riordino automatico incoerente.
    { message: 'La scorta massima non può essere inferiore alla minima.', path: ['maxStock'] },
  );

export const prodottoAggiornaSchema = prodottoCreaSchema.innerType().partial();

export type ProdottoCreaInput = z.infer<typeof prodottoCreaSchema>;
export type ProdottoAggiornaInput = z.infer<typeof prodottoAggiornaSchema>;

// ─────────────────────────── Ubicazioni ───────────────────────────

const segmento = (etichetta: string, max = 20) =>
  testo(max).min(1, `${etichetta}: campo obbligatorio.`);

export const ubicazioneCreaSchema = z.object({
  code: testo(40)
    .min(1, 'Il codice è obbligatorio.')
    // Il codice è l'etichetta stampata e scansionata: niente spazi o caratteri
    // che il lettore di codici a barre non riproduce in modo affidabile.
    .regex(/^[A-Za-z0-9._-]+$/, 'Il codice ammette solo lettere, cifre, punto, trattino e trattino basso.'),
  zone: segmento('Zona'),
  aisle: segmento('Corsia'),
  rack: segmento('Scaffale'),
  shelf: segmento('Ripiano'),
  bin: segmento('Vano'),
  kind: z.enum(TIPI_UBICAZIONE).default('STOCCAGGIO'),
  pickOrder: interoNonNegativo('Ordine di percorrenza').default(0),
  capacity: interoOpzionale('Capienza'),
  notes: testoOpzionale(1000),
  active: z.boolean().default(true),
});

export const ubicazioneAggiornaSchema = ubicazioneCreaSchema.partial();

export type UbicazioneCreaInput = z.infer<typeof ubicazioneCreaSchema>;

// ─────────────────────────── Movimenti manuali ───────────────────────────

/**
 * Solo i due movimenti che l'operatore può creare a mano da questo modulo:
 * ricevimenti, prelievi e spedizioni nascono da un documento, non da un form.
 */
export const movimentoManualeSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('TRASFERIMENTO'),
      productId: identificativo,
      qty: z.number().int().positive('La quantità deve essere maggiore di zero.'),
      fromLocationId: identificativo,
      toLocationId: identificativo,
      batchId: identificativoOpzionale,
      reason: testoOpzionale(300),
    }),
    z.object({
      type: z.literal('RETTIFICA'),
      productId: identificativo,
      qty: z.number().int().positive('La quantità deve essere maggiore di zero.'),
      locationId: identificativo,
      /** `aumento` carica l'ubicazione, `diminuzione` la scarica. */
      verso: z.enum(['aumento', 'diminuzione']),
      batchId: identificativoOpzionale,
      // La rettifica manuale cambia la giacenza senza un documento a monte:
      // senza motivo scritto la differenza inventariale resta inspiegabile.
      reason: testo(300).min(3, 'Il motivo della rettifica è obbligatorio.'),
    }),
  ])
  .refine(
    (d) => d.type !== 'TRASFERIMENTO' || d.fromLocationId !== d.toLocationId,
    {
      message: 'Partenza e destinazione non possono coincidere.',
      path: ['toLocationId'],
    },
  );

export type MovimentoManualeInput = z.infer<typeof movimentoManualeSchema>;
