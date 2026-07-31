import { z } from 'zod';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { IVA_ORDINARIA_BP } from '@/lib/money';

/**
 * Validazione del modulo ACQUISTI — ordini di acquisto, ricevimento merce,
 * anagrafica fornitori.
 *
 * Regola non negoziabile: il client manda righe (prodotto, quantità, costo,
 * sconto), MAI totali. Gli importi restano interi in centesimi e le percentuali
 * interi in punti base: qui si rifiuta tutto ciò che non è intero, così un
 * `12,999` arrivato dal browser non diventa un errore contabile in fattura.
 */

// ─────────────────────────── Mattoni comuni ───────────────────────────

/** Un milione di euro per riga: oltre è quasi certamente un errore di digitazione. */
const MAX_CENTESIMI = 100_000_000;
const MAX_QUANTITA = 1_000_000;
/** Tetto alle righe: un documento è un documento, non un'importazione di massa. */
export const MAX_RIGHE = 200;

const centesimi = z
  .number({ invalid_type_error: 'Importo non valido.' })
  .int('Gli importi sono interi in centesimi.')
  .min(0, "L'importo non può essere negativo.")
  .max(MAX_CENTESIMI, 'Importo fuori scala.');

const quantita = z
  .number({ invalid_type_error: 'Quantità non valida.' })
  .int('La quantità è un numero intero.')
  .min(1, 'La quantità deve essere almeno 1.')
  .max(MAX_QUANTITA, 'Quantità fuori scala.');

const puntiBase = z
  .number({ invalid_type_error: 'Percentuale non valida.' })
  .int('Le percentuali sono interi in punti base (2200 = 22%).')
  .min(0, 'La percentuale non può essere negativa.')
  .max(10_000, 'La percentuale non può superare il 100%.');

const identificativo = z.string().trim().min(1).max(64);

/**
 * Testo facoltativo: la stringa vuota del form diventa `null` (svuota il campo),
 * mentre la chiave ASSENTE resta `undefined` (Prisma non tocca il campo). La
 * distinzione serve alle PATCH parziali: senza di essa un aggiornamento di due
 * campi cancellerebbe in silenzio tutti gli altri.
 */
const testoOpzionale = (max = 200) =>
  z
    .union([z.string().trim().max(max, `Testo troppo lungo (max ${max}).`), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

const idOpzionale = z
  .union([identificativo, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

const emailOpzionale = z
  .union([z.literal(''), z.null(), z.string().trim().email('Indirizzo e-mail non valido.')])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

/** Accetta "2026-03-14" dal campo data del browser, oppure una ISO completa. */
const dataOpzionale = z
  .union([z.literal(''), z.null(), z.coerce.date()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

// ─────────────────────────── Ordini di acquisto ───────────────────────────

export const rigaOrdineAcquistoSchema = z.object({
  productId: identificativo,
  qty: quantita,
  /** Costo unitario: arriva dal client ma è validato come intero ≥ 0. */
  unitCostCents: centesimi,
  discountBp: puntiBase.default(0),
  vatRateBp: puntiBase.default(IVA_ORDINARIA_BP),
  note: testoOpzionale(200),
});

export const creaOrdineAcquistoSchema = z.object({
  supplierId: identificativo,
  expectedAt: dataOpzionale,
  shippingCents: centesimi.default(0),
  notes: testoOpzionale(2000),
  righe: z
    .array(rigaOrdineAcquistoSchema)
    .min(1, 'Inserire almeno una riga.')
    .max(MAX_RIGHE, `Massimo ${MAX_RIGHE} righe per ordine.`),
});

/**
 * Modifica di un ordine: solo in BOZZA (verificato nella rotta). Se `righe` è
 * presente sostituisce l'intero corpo dell'ordine — in bozza `receivedQty` è
 * sempre 0, quindi non si perde nulla di ricevuto.
 */
export const aggiornaOrdineAcquistoSchema = z.object({
  supplierId: identificativo.optional(),
  expectedAt: dataOpzionale,
  shippingCents: centesimi.optional(),
  notes: testoOpzionale(2000),
  righe: z
    .array(rigaOrdineAcquistoSchema)
    .min(1, 'Inserire almeno una riga.')
    .max(MAX_RIGHE, `Massimo ${MAX_RIGHE} righe per ordine.`)
    .optional(),
});

export const confermaOrdineSchema = z.object({
  expectedAt: dataOpzionale,
});

export const annullaOrdineSchema = z.object({
  motivo: testoOpzionale(300),
});

export type CreaOrdineAcquisto = z.infer<typeof creaOrdineAcquistoSchema>;
export type AggiornaOrdineAcquisto = z.infer<typeof aggiornaOrdineAcquistoSchema>;

// ─────────────────────────── Ricevimento merce ───────────────────────────

export const rigaRicevimentoSchema = z.object({
  productId: identificativo,
  /** Riga d'ordine collegata: assente per un ricevimento senza ordine. */
  purchaseLineId: idOpzionale,
  /** Ubicazione di messa a dimora: la merce entra sempre in un posto preciso. */
  locationId: identificativo,
  qty: quantita,
  /**
   * Facoltativo: se manca, il costo lo decide il server (riga d'ordine, poi
   * costo di listino del prodotto). Mai un valore inventato dal browser.
   */
  unitCostCents: centesimi.optional(),
  lotto: testoOpzionale(60),
  scadenza: dataOpzionale,
  note: testoOpzionale(200),
});

export const creaRicevimentoSchema = z
  .object({
    purchaseOrderId: idOpzionale,
    supplierId: idOpzionale,
    invoiceNumber: testoOpzionale(60),
    receivedAt: dataOpzionale,
    notes: testoOpzionale(2000),
    /**
     * Ricevere più di quanto ordinato è possibile ma mai in silenzio: il server
     * rifiuta con 409 finché l'operatore non conferma esplicitamente.
     */
    consentiEccedenza: z.boolean().default(false),
    righe: z
      .array(rigaRicevimentoSchema)
      .min(1, 'Inserire almeno una riga.')
      .max(MAX_RIGHE, `Massimo ${MAX_RIGHE} righe per ricevimento.`),
  })
  .refine((d) => Boolean(d.purchaseOrderId ?? d.supplierId), {
    message: 'Indicare un ordine di acquisto oppure un fornitore.',
    path: ['supplierId'],
  });

export type CreaRicevimento = z.infer<typeof creaRicevimentoSchema>;

// ─────────────────────────── Fornitori ───────────────────────────

export const creaFornitoreSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Codice troppo corto.')
    .max(32, 'Codice troppo lungo.')
    .regex(/^[A-Za-z0-9._-]+$/, 'Il codice ammette lettere, cifre, punto, trattino e trattino basso.')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Ragione sociale obbligatoria.').max(160),
  vatNumber: testoOpzionale(20),
  taxCode: testoOpzionale(20),
  email: emailOpzionale,
  phone: testoOpzionale(40),
  contactName: testoOpzionale(120),
  addressLine: testoOpzionale(200),
  city: testoOpzionale(80),
  postalCode: testoOpzionale(12),
  province: testoOpzionale(4),
  country: z
    .union([z.literal(''), z.null(), z.string().trim().length(2, 'Codice paese di 2 lettere (es. IT).')])
    .optional()
    .transform((v) => (v === undefined || v === null || v === '' ? 'IT' : v.toUpperCase())),
  paymentTerms: testoOpzionale(120),
  leadTimeDays: z
    .number()
    .int('Il tempo di consegna è un numero intero di giorni.')
    .min(0)
    .max(365, 'Tempo di consegna fuori scala.')
    .default(7),
  notes: testoOpzionale(2000),
});

export const aggiornaFornitoreSchema = creaFornitoreSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreaFornitore = z.infer<typeof creaFornitoreSchema>;

// ─────────────────────────── Filtri di elenco ───────────────────────────

export type FiltriAcquisti = {
  stato?: string | null;
  fornitore?: string | null;
  dal?: string | null;
  al?: string | null;
  q?: string | null;
};

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

function giorno(valore: string | null | undefined): Date | null {
  if (!valore || !GIORNO.test(valore)) return null;
  const d = new Date(`${valore}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Il giorno finale è inclusivo: si confronta con l'istante successivo. */
function giornoDopo(valore: string | null | undefined): Date | null {
  const d = giorno(valore);
  return d ? new Date(d.getTime() + 86_400_000) : null;
}

export function statoAcquistoValido(valore: string | null | undefined): PurchaseOrderStatus | null {
  if (!valore) return null;
  return valore in PurchaseOrderStatus ? (valore as PurchaseOrderStatus) : null;
}

function intervallo(f: FiltriAcquisti): Prisma.DateTimeFilter | null {
  const dal = giorno(f.dal);
  const al = giornoDopo(f.al);
  if (!dal && !al) return null;
  const range: Prisma.DateTimeFilter = {};
  if (dal) range.gte = dal;
  if (al) range.lt = al;
  return range;
}

/**
 * Filtro degli ordini di acquisto — costruito una volta sola e riusato dalla
 * pagina e dalla rotta API, così elenco e conteggio non possono divergere.
 * Il periodo guarda la data d'ordine; le bozze, che non ce l'hanno ancora,
 * ricadono sulla data di creazione.
 */
export function whereOrdiniAcquisto(f: FiltriAcquisti): Prisma.PurchaseOrderWhereInput {
  const where: Prisma.PurchaseOrderWhereInput = {};
  const stato = statoAcquistoValido(f.stato);
  if (stato) where.status = stato;
  if (f.fornitore) where.supplierId = f.fornitore;

  const and: Prisma.PurchaseOrderWhereInput[] = [];
  const range = intervallo(f);
  if (range) {
    and.push({
      OR: [{ orderedAt: range }, { orderedAt: null, createdAt: range }],
    });
  }
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
        { supplier: { code: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;
  return where;
}

/** Filtro dei ricevimenti: fornitore, periodo di arrivo, numero documento/fattura. */
export function whereRicevimenti(f: FiltriAcquisti): Prisma.GoodsReceiptWhereInput {
  const where: Prisma.GoodsReceiptWhereInput = {};
  if (f.fornitore) where.supplierId = f.fornitore;

  const and: Prisma.GoodsReceiptWhereInput[] = [];
  const range = intervallo(f);
  if (range) and.push({ receivedAt: range });
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { number: { contains: q, mode: 'insensitive' } },
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { purchaseOrder: { number: { contains: q, mode: 'insensitive' } } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;
  return where;
}

/** Filtro dei fornitori: testo libero su codice, ragione sociale e partita IVA. */
export function whereFornitori(f: { q?: string | null; attivo?: string | null }): Prisma.SupplierWhereInput {
  const where: Prisma.SupplierWhereInput = {};
  // Predefinito: solo attivi. `attivo=tutti` mostra anche i disattivati.
  if (f.attivo !== 'tutti') where.active = f.attivo === 'no' ? false : true;
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { vatNumber: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// ─────────────────────────── Transizioni di stato ───────────────────────────

/**
 * Ciclo di vita dell'ordine di acquisto. Le transizioni vivono qui e non
 * sparse nelle rotte: uno stato raggiunto per una strada non prevista è un
 * ordine che nessun report riesce più a spiegare.
 *
 * BOZZA → ORDINATO → RICEVUTO_PARZIALE → RICEVUTO, con ANNULLATO come uscita
 * solo prima che entri merce.
 */
export const TRANSIZIONI: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  BOZZA: ['ORDINATO', 'ANNULLATO'],
  ORDINATO: ['RICEVUTO_PARZIALE', 'RICEVUTO', 'ANNULLATO'],
  RICEVUTO_PARZIALE: ['RICEVUTO'],
  RICEVUTO: [],
  ANNULLATO: [],
};

export function puoPassareA(
  da: PurchaseOrderStatus,
  a: PurchaseOrderStatus,
): boolean {
  return TRANSIZIONI[da].includes(a);
}

/** Stato dell'ordine ricalcolato dalle quantità ricevute sulle righe. */
export function statoDaRighe(
  attuale: PurchaseOrderStatus,
  righe: ReadonlyArray<{ qty: number; receivedQty: number }>,
): PurchaseOrderStatus {
  if (attuale === 'ANNULLATO' || attuale === 'BOZZA') return attuale;
  if (righe.length === 0) return attuale;
  if (righe.every((r) => r.receivedQty >= r.qty)) return 'RICEVUTO';
  if (righe.some((r) => r.receivedQty > 0)) return 'RICEVUTO_PARZIALE';
  return 'ORDINATO';
}
