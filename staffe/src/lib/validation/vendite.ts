import { z } from 'zod';

/**
 * Schemi di validazione del ciclo attivo: ordini di vendita, prelievo,
 * imballaggio, spedizioni e anagrafica clienti.
 *
 * Regola non negoziabile: qui entrano solo **dati grezzi**, mai totali. Prezzi,
 * sconti e imposte vengono ricalcolati dal server (`computeTotals`) partendo da
 * `Product.priceCents` e `Customer.discountBp`: un totale che arriva dal client
 * è un numero che il cliente può scegliersi da solo.
 */

const CENTESIMI = z
  .number()
  .int('Gli importi sono interi in centesimi.')
  .min(0, 'L’importo non può essere negativo.')
  .max(99_999_999, 'Importo fuori scala.');

const PUNTI_BASE = z
  .number()
  .int('Le percentuali sono interi in punti base (2200 = 22%).')
  .min(0, 'La percentuale non può essere negativa.')
  .max(10_000, 'La percentuale non può superare il 100%.');

const QUANTITA = z
  .number()
  .int('La quantità deve essere un numero intero.')
  .positive('La quantità deve essere maggiore di zero.')
  .max(1_000_000, 'Quantità fuori scala.');

const ID = z.string().trim().min(1, 'Riferimento obbligatorio.').max(40);

/** Testo facoltativo: la stringa vuota del modulo vale «non compilato». */
const testo = (max: number) => z.string().trim().max(max).nullish();

const emailOpz = z
  .union([z.string().trim().toLowerCase().email('Indirizzo e-mail non valido.'), z.literal('')])
  .nullish();

/**
 * Normalizza un campo di testo facoltativo: «» → `null`.
 * I moduli HTML inviano stringhe vuote, il database deve ricevere `null`,
 * altrimenti un campo «vuoto» e uno «mai compilato» diventano indistinguibili.
 */
export function testoONull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}

// ─────────────────────────── Ordini di vendita ───────────────────────────

export const rigaOrdineVenditaSchema = z.object({
  productId: ID,
  qty: QUANTITA,
  /** Prezzo negoziato. Se assente il server usa `Product.priceCents`. */
  unitPriceCents: CENTESIMI.optional(),
  /** Sconto di riga. Se assente il server usa `Customer.discountBp`. */
  discountBp: PUNTI_BASE.optional(),
  /** Aliquota IVA. Se assente il server usa `Product.vatRateBp`. */
  vatRateBp: PUNTI_BASE.optional(),
  note: testo(500),
});

export type RigaOrdineVendita = z.infer<typeof rigaOrdineVenditaSchema>;

/** Solo gli stati che l'utente può impostare a mano: il resto lo muovono i documenti. */
export const statoModificabileSchema = z.enum(['BOZZA', 'PREVENTIVO']);

export const creaOrdineVenditaSchema = z.object({
  customerId: ID,
  status: statoModificabileSchema.optional(),
  orderedAt: z.coerce.date().nullish(),
  shippingCents: CENTESIMI.optional(),
  discountBp: PUNTI_BASE.optional(),
  notes: testo(2000),
  lines: z
    .array(rigaOrdineVenditaSchema)
    .min(1, 'L’ordine deve avere almeno una riga.')
    .max(200, 'Troppe righe in un solo ordine.'),
});

export const aggiornaOrdineVenditaSchema = z.object({
  customerId: ID.optional(),
  status: statoModificabileSchema.optional(),
  orderedAt: z.coerce.date().nullish(),
  shippingCents: CENTESIMI.optional(),
  discountBp: PUNTI_BASE.optional(),
  notes: testo(2000),
  /** Se presente sostituisce **tutte** le righe (modifica solo in bozza/preventivo). */
  lines: z
    .array(rigaOrdineVenditaSchema)
    .min(1, 'L’ordine deve avere almeno una riga.')
    .max(200, 'Troppe righe in un solo ordine.')
    .optional(),
});

export const confermaOrdineSchema = z.object({
  notes: testo(2000),
});

export const annullaOrdineSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, 'Indicare il motivo dell’annullamento.')
    .max(500),
});

// ─────────────────────────── Prelievo e imballaggio ───────────────────────────

export const creaPrelievoSchema = z.object({
  salesOrderId: ID,
  assignedToId: ID.nullish(),
  notes: testo(1000),
});

/**
 * Verifica di una riga di prelievo.
 *
 * O si scansiona il codice a barre del prodotto, o si dichiara **perché** non lo
 * si è fatto: una riga spuntata a memoria, senza traccia, è esattamente l'errore
 * che il prelievo controllato deve impedire.
 */
export const verificaRigaSchema = z
  .object({
    barcode: testo(120),
    pickedQty: z
      .number()
      .int('La quantità prelevata deve essere un numero intero.')
      .min(0, 'La quantità prelevata non può essere negativa.')
      .max(1_000_000)
      .optional(),
    motivo: testo(500),
  })
  .refine(
    (v) => testoONull(v.barcode) !== null || (testoONull(v.motivo) ?? '').length >= 5,
    {
      path: ['motivo'],
      message:
        'Senza scansione del codice a barre è obbligatorio indicare il motivo (almeno 5 caratteri).',
    },
  );

export const completaPrelievoSchema = z.object({
  /** Obbligatorio se restano righe prelevate ma non verificate con la scansione. */
  motivoNonVerificate: testo(500),
});

// ─────────────────────────── Spedizioni ───────────────────────────

export const creaSpedizioneSchema = z.object({
  salesOrderId: ID,
  carrier: testo(120),
  trackingNumber: testo(120),
  packagesCount: z.number().int().min(1, 'Almeno un collo.').max(9_999).optional(),
  weightGrams: z.number().int().min(0).max(100_000_000).optional(),
  notes: testo(1000),
});

export const statoSpedizioneSchema = z.enum(['IMBALLATA', 'SPEDITA', 'CONSEGNATA']);

export const aggiornaSpedizioneSchema = z.object({
  carrier: testo(120),
  trackingNumber: testo(120),
  packagesCount: z.number().int().min(1, 'Almeno un collo.').max(9_999).optional(),
  weightGrams: z.number().int().min(0).max(100_000_000).optional(),
  notes: testo(1000),
  stato: statoSpedizioneSchema.optional(),
});

// ─────────────────────────── Clienti ───────────────────────────

const CAP = z
  .union([z.string().trim().regex(/^\d{5}$/, 'Il CAP italiano ha 5 cifre.'), z.literal('')])
  .nullish();

const PROVINCIA = z
  .union([
    z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'La provincia è la sigla di 2 lettere.'),
    z.literal(''),
  ])
  .nullish();

const PAESE = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Il paese è il codice ISO di 2 lettere (IT, DE, FR…).');

export const clienteSchema = z.object({
  /** Se assente il server genera il progressivo `CLI-0001`. */
  code: z
    .union([
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9._-]{2,40}$/, 'Il codice ammette lettere, cifre, punto, trattino.'),
      z.literal(''),
    ])
    .nullish(),
  name: z.string().trim().min(2, 'Ragione sociale obbligatoria.').max(200),
  vatNumber: z
    .union([
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{0,2}[0-9A-Z]{5,18}$/, 'Partita IVA non valida.'),
      z.literal(''),
    ])
    .nullish(),
  taxCode: z
    .union([
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9A-Z]{11,16}$/, 'Codice fiscale non valido.'),
      z.literal(''),
    ])
    .nullish(),
  /** Codice destinatario per la fatturazione elettronica: 7 caratteri (6 per la PA). */
  sdiCode: z
    .union([
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9A-Z]{6,7}$/, 'Il codice destinatario SDI ha 6 o 7 caratteri.'),
      z.literal(''),
    ])
    .nullish(),
  pec: emailOpz,
  email: emailOpz,
  phone: testo(40),
  contactName: testo(120),
  addressLine: testo(200),
  city: testo(120),
  postalCode: CAP,
  province: PROVINCIA,
  country: PAESE.optional(),
  shipAddressLine: testo(200),
  shipCity: testo(120),
  shipPostalCode: CAP,
  shipProvince: PROVINCIA,
  shipCountry: z.union([PAESE, z.literal('')]).nullish(),
  paymentTerms: testo(120),
  discountBp: PUNTI_BASE.optional(),
  notes: testo(2000),
  active: z.boolean().optional(),
});

export const aggiornaClienteSchema = clienteSchema.partial();

export type DatiCliente = z.infer<typeof clienteSchema>;
