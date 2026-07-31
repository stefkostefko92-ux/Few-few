import { z } from 'zod';
import type {
  AttachmentKind,
  InventoryCountStatus,
  InventoryCountType,
  Role,
} from '@prisma/client';

/**
 * Schemi di validazione dei moduli Inventario · Utenti · Audit · Allegati.
 *
 * Come per i prodotti, gli enum sono ripetuti come tuple di letterali (e non
 * come `z.nativeEnum`) perché questi schemi vengono importati anche dai form
 * lato client: una tupla `as const` resta un valore JavaScript puro, mentre
 * `@prisma/client` a runtime trascinerebbe il motore di query nel browser. Il
 * `satisfies` fa comunque fallire la compilazione se il dominio Prisma cambia.
 */

export const TIPI_INVENTARIO = [
  'CICLICO',
  'TOTALE',
] as const satisfies readonly InventoryCountType[];

export const STATI_INVENTARIO = [
  'APERTO',
  'IN_CORSO',
  'CHIUSO',
  'ANNULLATO',
] as const satisfies readonly InventoryCountStatus[];

export const RUOLI = [
  'AMMINISTRATORE',
  'MAGAZZINO',
  'VENDITE',
] as const satisfies readonly Role[];

export const TIPI_ALLEGATO = [
  'DISEGNO',
  'FOTO',
  'PDF',
  'CAD',
  'ISTRUZIONI',
  'ALTRO',
] as const satisfies readonly AttachmentKind[];

/**
 * Un inventario totale su un magazzino grande genera decine di migliaia di
 * righe: oltre questo tetto la sessione di conteggio non è più gestibile a mano
 * e conviene spezzarla in conteggi ciclici per zona.
 */
export const MAX_RIGHE_INVENTARIO = 5000;

/** Righe salvabili in una sola chiamata dallo schermo di conteggio. */
export const MAX_RIGHE_PER_SALVATAGGIO = 200;

/**
 * Lunghezza minima della password. Dodici caratteri con una lista di blocco
 * valgono più di otto caratteri con regole di composizione: è la direzione
 * indicata dal NIST e non costringe l'operatore a scrivere la password sul
 * bordo dello scaffale.
 */
export const PASSWORD_MIN = 12;
/** bcrypt legge solo i primi 72 byte: oltre non aggiunge entropia, solo carico. */
export const PASSWORD_MAX = 200;

// ─────────────────────────── Mattoni comuni ───────────────────────────

const testo = (max: number) => z.string().trim().max(max);

/** Campo di testo facoltativo: la stringa vuota del form diventa `null`. */
const testoOpzionale = (max: number) =>
  testo(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));

const identificativo = z.string().cuid('Identificativo non valido.');

/** Il `<select>` vuoto invia `""`: significa «nessuno», non «malformato». */
const identificativoOpzionale = z
  .union([identificativo, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === '' || v === null ? null : v));

const quantitaContata = z
  .number({ invalid_type_error: 'Quantità: inserire un numero intero.' })
  .int('Quantità: sono ammessi solo numeri interi.')
  .min(0, 'Quantità: non può essere negativa.')
  .max(9_999_999, 'Quantità fuori scala: controllare la cifra digitata.');

// ─────────────────────────── Inventario ───────────────────────────

/**
 * Creazione del conteggio.
 *
 * Il conteggio ciclico deve avere almeno un criterio: senza filtri sarebbe un
 * inventario totale mascherato, con il rischio di aprirne uno enorme per errore.
 */
export const inventarioCreaSchema = z
  .object({
    type: z.enum(TIPI_INVENTARIO).default('CICLICO'),
    zone: testoOpzionale(40),
    categoryId: identificativoOpzionale,
    // Senza `.default()`: `readBody` deduce il tipo di INGRESSO dello schema,
    // quindi un campo con valore predefinito resterebbe comunque facoltativo
    // per TypeScript. Meglio dichiararlo facoltativo e gestirlo nella rotta.
    productIds: z.array(identificativo).max(500).optional(),
    notes: testoOpzionale(1000),
  })
  .refine(
    (d) =>
      d.type === 'TOTALE' ||
      !!d.zone ||
      !!d.categoryId ||
      (d.productIds?.length ?? 0) > 0,
    {
      message:
        'Il conteggio ciclico richiede almeno un criterio: zona, categoria o elenco di prodotti.',
      path: ['zone'],
    },
  );

export type InventarioCreaInput = z.infer<typeof inventarioCreaSchema>;

/** Stati impostabili a mano: la chiusura ha una rotta propria (muove giacenze). */
export const inventarioAggiornaSchema = z.object({
  status: z.enum(['IN_CORSO', 'ANNULLATO']).optional(),
  notes: testoOpzionale(1000),
});

export const rigaContaSchema = z.object({
  lineId: identificativo,
  /** `null` = riga non ancora contata (diverso da «contata zero»). */
  countedQty: quantitaContata.nullable(),
  /** Vero solo dopo la scansione del codice a barre del prodotto. */
  verified: z.boolean().optional(),
  note: testoOpzionale(300),
});

export const contaSalvaSchema = z.object({
  righe: z
    .array(rigaContaSchema)
    .min(1, 'Nessuna riga da salvare.')
    .max(MAX_RIGHE_PER_SALVATAGGIO),
});

/**
 * Merce trovata in un'ubicazione dove il sistema non ne prevede: si aggiunge una
 * riga al conteggio, altrimenti l'eccedenza resta fuori dal verbale e la
 * giacenza continua a mentire.
 */
export const rigaAggiuntaSchema = z
  .object({
    productId: identificativoOpzionale,
    /**
     * SKU o codice a barre, per chi arriva dallo scanner: il lettore consegna un
     * codice, non un identificativo interno. Il server lo risolve.
     */
    codice: testoOpzionale(40),
    locationId: identificativo,
    countedQty: quantitaContata,
    verified: z.boolean().optional(),
    note: testoOpzionale(300),
  })
  .refine((d) => !!d.productId !== !!d.codice, {
    message: 'Indicare il prodotto oppure il suo codice, non entrambi.',
    path: ['codice'],
  });

export const chiusuraSchema = z.object({
  /**
   * Chiude anche con righe non contate (che restano senza rettifica). Senza
   * conferma esplicita la chiusura si ferma: «non contato» non è «zero».
   */
  forza: z.boolean().default(false),
});

// ─────────────────────────── Utenti ───────────────────────────

const password = z
  .string()
  .min(PASSWORD_MIN, `La password deve avere almeno ${PASSWORD_MIN} caratteri.`)
  .max(PASSWORD_MAX, `La password non può superare ${PASSWORD_MAX} caratteri.`)
  .refine(
    (v) => v.trim().length === v.length,
    'La password non può iniziare o finire con uno spazio.',
  );

export const utenteCreaSchema = z.object({
  name: testo(120).min(2, 'Il nome deve avere almeno 2 caratteri.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Indirizzo e-mail non valido.')
    .max(200),
  role: z.enum(RUOLI),
  password,
});

export const utenteAggiornaSchema = z
  .object({
    name: testo(120).min(2, 'Il nome deve avere almeno 2 caratteri.').optional(),
    role: z.enum(RUOLI).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (d) => d.name !== undefined || d.role !== undefined || d.active !== undefined,
    'Nessuna modifica da salvare.',
  );

export const passwordResetSchema = z.object({ password });

export type UtenteCreaInput = z.infer<typeof utenteCreaSchema>;
export type UtenteAggiornaInput = z.infer<typeof utenteAggiornaSchema>;

// ─────────────────────────── Audit ───────────────────────────

const giorno = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida: usare il formato AAAA-MM-GG.');

export const auditFiltriSchema = z.object({
  userId: identificativoOpzionale,
  entity: testoOpzionale(60),
  action: testoOpzionale(60),
  da: giorno.optional(),
  a: giorno.optional(),
});

export type AuditFiltri = z.infer<typeof auditFiltriSchema>;

/**
 * Legge i filtri dalla query string. I parametri vuoti spariscono prima della
 * validazione: un campo lasciato in bianco nel form è «nessun filtro», non un
 * valore malformato.
 */
export function leggiFiltriAudit(params: URLSearchParams): AuditFiltri {
  const val = (k: string) => {
    const v = params.get(k)?.trim();
    return v ? v : undefined;
  };
  return auditFiltriSchema.parse({
    userId: val('userId'),
    entity: val('entity'),
    action: val('action'),
    da: val('da'),
    a: val('a'),
  });
}

/** Estremi del periodo: `a` include tutta la giornata indicata. */
export function periodoAudit(filtri: AuditFiltri): {
  gte?: Date;
  lte?: Date;
} {
  const out: { gte?: Date; lte?: Date } = {};
  if (filtri.da) out.gte = new Date(`${filtri.da}T00:00:00.000`);
  if (filtri.a) out.lte = new Date(`${filtri.a}T23:59:59.999`);
  return out;
}

// ─────────────────────────── Allegati ───────────────────────────

/**
 * Metadati dell'allegato. Esattamente UN documento di destinazione: un allegato
 * appeso a due entità avrebbe due regole di permesso diverse e vincerebbe la più
 * debole.
 */
export const allegatoMetaSchema = z
  .object({
    kind: z.enum(TIPI_ALLEGATO).optional(),
    productId: identificativoOpzionale,
    purchaseOrderId: identificativoOpzionale,
    salesOrderId: identificativoOpzionale,
    goodsReceiptId: identificativoOpzionale,
  })
  .refine(
    (d) =>
      [d.productId, d.purchaseOrderId, d.salesOrderId, d.goodsReceiptId].filter(
        Boolean,
      ).length === 1,
    {
      message:
        'Indicare esattamente un documento a cui allegare il file (prodotto, ordine di acquisto, ordine di vendita o ricevimento).',
      path: ['productId'],
    },
  );

export type AllegatoMeta = z.infer<typeof allegatoMetaSchema>;
