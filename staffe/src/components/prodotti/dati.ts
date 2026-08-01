import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { pagination, type Pagination } from '@/lib/api';
import type { StatoScorta } from '@/lib/validation/prodotti';

/**
 * Letture condivise del modulo Prodotti · Giacenze · Ubicazioni.
 *
 * Stanno qui, e non in `src/lib/`, perché sono specifiche di questo modulo: le
 * usano sia le pagine (Server Component, che leggono il database direttamente)
 * sia le rotte REST, e duplicarle significherebbe avere due definizioni diverse
 * di «sotto scorta» che prima o poi divergono.
 */

/** In Next 15 `searchParams` è una Promise e ogni chiave può arrivare ripetuta. */
export type ParametriRicerca = Record<string, string | string[] | undefined>;

export function param(sp: ParametriRicerca, chiave: string): string {
  const v = sp[chiave];
  return ((Array.isArray(v) ? v[0] : v) ?? '').trim();
}

/** Parametri da conservare nei link di paginazione (le chiavi vuote spariscono). */
export function parametriAttivi(
  sp: ParametriRicerca,
  chiavi: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of chiavi) {
    const v = param(sp, k);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Le pagine paginano con le stesse regole delle rotte REST (stesso `pagination`
 * di `@/lib/api`), così un limite cambiato vale ovunque.
 */
export function paginazioneDa(sp: ParametriRicerca, perPage = 25): Pagination {
  const url = new URL('http://staffe.locale/');
  const page = param(sp, 'page');
  if (page) url.searchParams.set('page', page);
  url.searchParams.set('perPage', String(perPage));
  return pagination(url, perPage);
}

export type FiltriProdotti = {
  q?: string | null;
  categoriaId?: string | null;
  fornitoreId?: string | null;
  soloAttivi?: boolean;
};

/** Ricerca libera: SKU, codice a barre, nome, descrizione, marca, compatibilità, categoria. */
export function whereProdotti(f: FiltriProdotti): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (f.soloAttivi !== false) where.active = true;
  if (f.categoriaId) where.categoryId = f.categoriaId;
  if (f.fornitoreId) where.supplierId = f.fornitoreId;

  const q = (f.q ?? '').trim();
  if (q.length > 0) {
    const contiene = { contains: q, mode: 'insensitive' as const };
    where.OR = [
      { sku: contiene },
      { barcode: contiene },
      { name: contiene },
      { description: contiene },
      { brand: contiene },
      { compatibility: contiene },
      { finish: contiene },
      { category: { name: contiene } },
      { category: { code: contiene } },
    ];
  }
  return where;
}

export type Giacenza = { qty: number; reservedQty: number; availableQty: number };

export const GIACENZA_ZERO: Giacenza = { qty: 0, reservedQty: 0, availableQty: 0 };

/**
 * Somma delle giacenze per prodotto. `productIds` vuoto significa «tutti»:
 * l'aggregazione avviene nel database, la pagina non somma riga per riga.
 */
export async function giacenzePerProdotto(
  productIds?: readonly string[],
): Promise<Map<string, Giacenza>> {
  if (productIds && productIds.length === 0) return new Map();
  const righe = await prisma.stockItem.groupBy({
    by: ['productId'],
    _sum: { qty: true, reservedQty: true },
    where: productIds ? { productId: { in: [...productIds] } } : undefined,
  });
  const mappa = new Map<string, Giacenza>();
  for (const r of righe) {
    const qty = r._sum.qty ?? 0;
    const reservedQty = r._sum.reservedQty ?? 0;
    mappa.set(r.productId, { qty, reservedQty, availableQty: qty - reservedQty });
  }
  return mappa;
}

/** Dettaglio per ubicazione dei prodotti indicati, in ordine di percorrenza. */
export async function ubicazioniDeiProdotti(productIds: readonly string[]) {
  if (productIds.length === 0) return [];
  return prisma.stockItem.findMany({
    where: { productId: { in: [...productIds] } },
    select: {
      id: true,
      productId: true,
      qty: true,
      reservedQty: true,
      batch: { select: { id: true, code: true } },
      location: { select: { id: true, code: true, kind: true, pickOrder: true } },
    },
    orderBy: [{ location: { pickOrder: 'asc' } }, { qty: 'desc' }],
  });
}

/**
 * Identificativi dei prodotti che rispettano lo stato di scorta richiesto.
 * `null` = nessun vincolo (filtro «tutti»).
 *
 * Il confronto con `minStock` non si può esprimere in una `where` Prisma perché
 * la soglia è una colonna del prodotto e la giacenza è la somma di un'altra
 * tabella: si leggono quindi le due grandezze e si incrociano qui. Il magazzino
 * ha migliaia di articoli, non milioni: il costo è trascurabile e il risultato
 * resta paginabile dal database (`id: { in: … }`).
 */
export async function idsPerStatoScorta(
  stato: StatoScorta,
  base: Prisma.ProductWhereInput,
): Promise<string[] | null> {
  if (stato === 'tutti') return null;

  const prodotti = await prisma.product.findMany({
    where: base,
    select: { id: true, minStock: true },
  });
  const giacenze = await giacenzePerProdotto(prodotti.map((p) => p.id));

  return prodotti
    .filter((p) => {
      const qty = giacenze.get(p.id)?.qty ?? 0;
      if (stato === 'esaurito') return qty <= 0;
      if (stato === 'sotto') return qty > 0 && qty <= p.minStock;
      return qty > p.minStock; // 'ok'
    })
    .map((p) => p.id);
}

/** Valorizzazione di magazzino: quantità × costo d'acquisto, in centesimi. */
export function valorizzazioneCents(
  righe: readonly { qty: number; costCents: number }[],
): number {
  return righe.reduce((somma, r) => somma + r.qty * r.costCents, 0);
}

/** Margine di riga in punti base: (prezzo − costo) / prezzo. */
export function margineBp(priceCents: number, costCents: number): number | null {
  if (priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) * 10_000) / priceCents);
}
