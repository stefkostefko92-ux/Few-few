import {
  MovementType,
  Prisma,
  type NotificationType,
  type StockMovement,
} from '@prisma/client';
import { prisma } from './db';

/**
 * Motore delle giacenze — l'unico punto in cui la quantità in magazzino cambia.
 *
 * Ricevimenti, prelievi, trasferimenti, rettifiche e inventari passano tutti da
 * qui. Nessun modulo scrive `StockItem.qty` direttamente: la giacenza deve
 * sempre avere un movimento che la spiega, altrimenti la differenza inventariale
 * diventa inspiegabile e la valorizzazione non torna.
 */

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockError';
  }
}

/** Da dove esce e dove entra la merce, per ciascun tipo di movimento. */
export type Direction = { needsFrom: boolean; needsTo: boolean };

export function directionOf(type: MovementType): Direction {
  switch (type) {
    case 'RICEVIMENTO':
    case 'RESO_CLIENTE':
      return { needsFrom: false, needsTo: true };
    case 'PRELIEVO':
    case 'SPEDIZIONE':
    case 'SCARTO':
    case 'RESO_FORNITORE':
      return { needsFrom: true, needsTo: false };
    case 'TRASFERIMENTO':
      return { needsFrom: true, needsTo: true };
    case 'RETTIFICA':
    case 'INVENTARIO':
      // Correzione: `to` per un aumento, `from` per una diminuzione — mai entrambi.
      return { needsFrom: false, needsTo: false };
  }
}

export type MovementInput = {
  productId: string;
  qty: number;
  type: MovementType;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  batchId?: string | null;
  unitCostCents?: number;
  reason?: string;
  refType?: string;
  refId?: string;
  userId?: string | null;
};

/** Controlli che non richiedono il database — testabili in isolamento. */
export function validateMovement(input: MovementInput): void {
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    throw new StockError('La quantità deve essere un intero positivo.');
  }
  const { needsFrom, needsTo } = directionOf(input.type);
  if (needsFrom && !input.fromLocationId) {
    throw new StockError('Ubicazione di partenza obbligatoria per questo movimento.');
  }
  if (needsTo && !input.toLocationId) {
    throw new StockError('Ubicazione di destinazione obbligatoria per questo movimento.');
  }
  if (
    input.type === 'TRASFERIMENTO' &&
    input.fromLocationId === input.toLocationId
  ) {
    throw new StockError('Partenza e destinazione non possono coincidere.');
  }
  if (
    (input.type === 'RETTIFICA' || input.type === 'INVENTARIO') &&
    !!input.fromLocationId === !!input.toLocationId
  ) {
    throw new StockError(
      'La rettifica richiede una sola ubicazione: di destinazione per un aumento, di partenza per una diminuzione.',
    );
  }
}

type Tx = Prisma.TransactionClient;

/** Chiave di unicità della giacenza — unico posto in cui si compone. */
export function stockKeyOf(
  productId: string,
  locationId: string,
  batchId: string | null,
): string {
  return `${productId}:${locationId}:${batchId ?? '-'}`;
}

async function decrease(
  tx: Tx,
  productId: string,
  locationId: string,
  batchId: string | null,
  qty: number,
): Promise<void> {
  const item = await tx.stockItem.findUnique({
    where: { stockKey: stockKeyOf(productId, locationId, batchId) },
  });
  if (!item || item.qty < qty) {
    throw new StockError(
      `Giacenza insufficiente nell’ubicazione selezionata: disponibili ${item?.qty ?? 0}, richiesti ${qty}.`,
    );
  }
  await tx.stockItem.update({
    where: { id: item.id },
    data: {
      qty: { decrement: qty },
      // L'impegnato non può superare la giacenza residua.
      reservedQty: Math.min(item.reservedQty, item.qty - qty),
    },
  });
}

async function increase(
  tx: Tx,
  productId: string,
  locationId: string,
  batchId: string | null,
  qty: number,
): Promise<void> {
  await tx.stockItem.upsert({
    where: { stockKey: stockKeyOf(productId, locationId, batchId) },
    create: {
      stockKey: stockKeyOf(productId, locationId, batchId),
      productId,
      locationId,
      batchId,
      qty,
    },
    update: { qty: { increment: qty } },
  });
}

/**
 * Applica un movimento **dentro** una transazione già aperta. Da usare quando il
 * movimento fa parte di un documento (ricevimento, prelievo): o si scrive tutto
 * o non si scrive niente.
 */
export async function applyMovement(
  tx: Tx,
  input: MovementInput,
): Promise<StockMovement> {
  validateMovement(input);
  const batchId = input.batchId ?? null;

  if (input.fromLocationId) {
    await decrease(tx, input.productId, input.fromLocationId, batchId, input.qty);
  }
  if (input.toLocationId) {
    await increase(tx, input.productId, input.toLocationId, batchId, input.qty);
  }

  return tx.stockMovement.create({
    data: {
      productId: input.productId,
      batchId,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      qty: input.qty,
      type: input.type,
      unitCostCents: input.unitCostCents ?? 0,
      reason: input.reason ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      userId: input.userId ?? null,
    },
  });
}

/** Movimento singolo, con transazione propria. */
export function moveStock(input: MovementInput): Promise<StockMovement> {
  return prisma.$transaction(async (tx) => {
    const movement = await applyMovement(tx, input);
    await checkLowStock(tx, input.productId);
    return movement;
  });
}

export type StockSummary = {
  qty: number;
  reservedQty: number;
  availableQty: number;
};

export async function stockOf(
  productId: string,
  client: Tx | typeof prisma = prisma,
): Promise<StockSummary> {
  const agg = await client.stockItem.aggregate({
    where: { productId },
    _sum: { qty: true, reservedQty: true },
  });
  const qty = agg._sum.qty ?? 0;
  const reservedQty = agg._sum.reservedQty ?? 0;
  return { qty, reservedQty, availableQty: qty - reservedQty };
}

/**
 * Impegna la merce per un ordine confermato. L'impegnato resta fisicamente in
 * ubicazione ma non è più vendibile: senza questo, due ordini vendono lo stesso
 * pezzo e uno dei due clienti resta scoperto.
 */
export async function reserve(
  tx: Tx,
  productId: string,
  qty: number,
): Promise<void> {
  const items = await tx.stockItem.findMany({
    where: { productId },
    orderBy: { qty: 'desc' },
  });
  let residuo = qty;
  for (const item of items) {
    if (residuo <= 0) break;
    const libero = item.qty - item.reservedQty;
    if (libero <= 0) continue;
    const quota = Math.min(libero, residuo);
    await tx.stockItem.update({
      where: { id: item.id },
      data: { reservedQty: { increment: quota } },
    });
    residuo -= quota;
  }
  if (residuo > 0) {
    throw new StockError(
      `Disponibilità insufficiente: mancano ${residuo} unità non ancora impegnate.`,
    );
  }
}

export async function release(
  tx: Tx,
  productId: string,
  qty: number,
): Promise<void> {
  const items = await tx.stockItem.findMany({
    where: { productId, reservedQty: { gt: 0 } },
    orderBy: { reservedQty: 'desc' },
  });
  let residuo = qty;
  for (const item of items) {
    if (residuo <= 0) break;
    const quota = Math.min(item.reservedQty, residuo);
    await tx.stockItem.update({
      where: { id: item.id },
      data: { reservedQty: { decrement: quota } },
    });
    residuo -= quota;
  }
}

/**
 * Apre (o chiude) l'avviso di sotto scorta / esaurito per un prodotto.
 *
 * La deduplicazione guarda `resolvedAt`, cioè se la CONDIZIONE è ancora aperta —
 * non se qualcuno l'ha letta. Legare i duplicati alla lettura significava che
 * appena un operatore segnava letto l'avviso, il prelievo successivo ne creava
 * subito un altro identico.
 *
 * Quando la giacenza risale sopra il minimo l'avviso si CHIUDE da solo: un
 * centro notifiche che mostra ancora „esaurito" per merce riassortita insegna
 * agli operatori a ignorarlo.
 */
export async function checkLowStock(tx: Tx, productId: string): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, sku: true, name: true, minStock: true },
  });
  if (!product) return;

  const agg = await tx.stockItem.aggregate({
    where: { productId },
    _sum: { qty: true },
  });
  const qty = agg._sum.qty ?? 0;
  const aperti = {
    entity: 'Product',
    entityId: product.id,
    type: { in: ['SCORTA_MINIMA', 'ESAURITO'] as NotificationType[] },
    resolvedAt: null,
  };

  if (qty > product.minStock) {
    await tx.notification.updateMany({
      where: aperti,
      data: { resolvedAt: new Date() },
    });
    return;
  }

  const type: NotificationType = qty <= 0 ? 'ESAURITO' : 'SCORTA_MINIMA';

  // Se è già aperto un avviso dello stesso tipo non se ne crea un altro. Se è
  // aperto quello dell'ALTRO tipo (da „scorta minima" si è passati a „esaurito",
  // o viceversa) lo si chiude: la gravità è cambiata e va detta.
  const esistenti = await tx.notification.findMany({
    where: aperti,
    select: { id: true, type: true },
  });
  if (esistenti.some((n) => n.type === type)) return;

  if (esistenti.length > 0) {
    await tx.notification.updateMany({
      where: { id: { in: esistenti.map((n) => n.id) } },
      data: { resolvedAt: new Date() },
    });
  }

  await tx.notification.create({
    data: {
      type,
      level: qty <= 0 ? 'CRITICO' : 'AVVISO',
      title: qty <= 0 ? `Esaurito: ${product.sku}` : `Scorta minima: ${product.sku}`,
      body: `${product.name} — giacenza ${qty}, minimo ${product.minStock}.`,
      entity: 'Product',
      entityId: product.id,
    },
  });
}

export type PickSuggestion = {
  locationId: string;
  batchId: string | null;
  qty: number;
};

/**
 * Registro delle quantità già assegnate ad altre righe della STESSA lista di
 * prelievo, per chiave di giacenza. Chi genera una lista lo crea una volta e lo
 * passa a ogni chiamata.
 */
export type Allocazioni = Map<string, number>;

/**
 * Suggerisce da dove prelevare: prima i vani con meno pezzi (si svuotano i
 * parziali), poi il chiamante riordina per percorso.
 *
 * `allocate` non è un dettaglio: senza di esso due righe dello stesso prodotto
 * nello stesso ordine riceverebbero entrambe la stessa giacenza, perché la
 * seconda chiamata rilegge un magazzino che la prima non ha ancora toccato — le
 * quantità si scaricano solo alla chiusura del prelievo. L'operatore andrebbe al
 * vano e non troverebbe i pezzi; l'errore comparirebbe solo alla fine, come
 * transazione fallita, invece che qui come „giacenza insufficiente".
 *
 * NOTA sull'impegnato: `reservedQty` NON viene sottratto di proposito. L'ordine
 * che si sta prelevando è, di regola, quello che ha impegnato la merce; toglierla
 * gli impedirebbe di prelevare la propria riserva. La difesa contro il prelievo
 * della riserva altrui resta `decrease()` in transazione.
 */
export async function suggestPickLocations(
  productId: string,
  qty: number,
  client: Tx | typeof prisma = prisma,
  allocate?: Allocazioni,
): Promise<PickSuggestion[]> {
  const items = await client.stockItem.findMany({
    where: { productId, qty: { gt: 0 } },
    include: { location: true },
    orderBy: [{ qty: 'asc' }],
  });

  const out: PickSuggestion[] = [];
  // Le assegnazioni si scrivono nel registro SOLO se la riga si copre tutta:
  // una riga fallita non deve lasciare pezzi „prenotati" a metà e far fallire
  // a catena le righe successive.
  const provvisorie = new Map<string, number>();
  let residuo = qty;

  for (const item of items) {
    if (residuo <= 0) break;
    if (!item.location.active) continue;

    const chiave = stockKeyOf(productId, item.locationId, item.batchId);
    const gia = allocate?.get(chiave) ?? 0;
    const libero = item.qty - gia;
    if (libero <= 0) continue;

    const quota = Math.min(libero, residuo);
    out.push({ locationId: item.locationId, batchId: item.batchId, qty: quota });
    provvisorie.set(chiave, gia + quota);
    residuo -= quota;
  }

  if (residuo > 0) {
    throw new StockError(
      `Giacenza insufficiente per il prelievo: mancano ${residuo} unità.`,
    );
  }

  if (allocate) {
    for (const [chiave, valore] of provvisorie) allocate.set(chiave, valore);
  }
  return out;
}
