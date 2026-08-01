import 'server-only';
import { Prisma, type SalesOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { computeTotals, type Totals } from '@/lib/money';
import type { RigaOrdineVendita } from '@/lib/validation/vendite';

/**
 * Servizi condivisi del ciclo attivo (vendite → prelievo → spedizione).
 *
 * Il file sta in una rotta ma non è una rotta: Next tratta come endpoint solo
 * `route.ts`. Qui vive ciò che più moduli devono fare **allo stesso modo** —
 * soprattutto il calcolo del prezzo, che non può divergere fra creazione e
 * modifica dell'ordine.
 */

/**
 * Errore di dati sollevabile **dentro** una transazione: `route()` lo traduce in
 * un 422 con messaggio italiano. Un `Error` generico diventerebbe un 500 muto e
 * l'operatore non saprebbe cosa correggere.
 */
export function erroreDati(message: string, path: (string | number)[] = []): z.ZodError {
  return new z.ZodError([{ code: 'custom', path, message }]);
}

export type RigaPreparata = {
  productId: string;
  qty: number;
  unitPriceCents: number;
  discountBp: number;
  vatRateBp: number;
  note: string | null;
};

/**
 * Traduce le righe inviate dal client in righe con prezzo, sconto e aliquota
 * **decisi dal server**.
 *
 * Il listino è `Product.priceCents` e lo sconto è `Customer.discountBp`: il
 * client può proporre un prezzo negoziato (è una trattativa commerciale, non un
 * campo nascosto), ma non può inventare l'aliquota IVA né il totale, che qui
 * non entra mai.
 */
export async function preparaRighe(
  tx: Prisma.TransactionClient,
  scontoCliente: number,
  righe: readonly RigaOrdineVendita[],
): Promise<RigaPreparata[]> {
  const ids = [...new Set(righe.map((r) => r.productId))];
  const prodotti = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, active: true, priceCents: true, vatRateBp: true },
  });
  const perId = new Map(prodotti.map((p) => [p.id, p]));

  return righe.map((riga) => {
    const prodotto = perId.get(riga.productId);
    if (!prodotto) {
      throw erroreDati('Prodotto inesistente in una delle righe.', ['lines']);
    }
    if (!prodotto.active) {
      throw erroreDati(`Il prodotto ${prodotto.sku} non è più a catalogo.`, ['lines']);
    }
    return {
      productId: prodotto.id,
      qty: riga.qty,
      unitPriceCents: riga.unitPriceCents ?? prodotto.priceCents,
      discountBp: riga.discountBp ?? scontoCliente,
      vatRateBp: riga.vatRateBp ?? prodotto.vatRateBp,
      note: riga.note?.trim() ? riga.note.trim() : null,
    };
  });
}

export type RigaTotalizzabile = {
  qty: number;
  unitPriceCents: number;
  discountBp: number;
  vatRateBp: number;
};

/** Totali del documento — un solo punto di calcolo, sul server. */
export function totaliOrdine(
  righe: readonly RigaTotalizzabile[],
  ordine: { shippingCents: number; discountBp: number },
): Totals {
  return computeTotals(righe, {
    shippingCents: ordine.shippingCents,
    headerDiscountBp: ordine.discountBp,
  });
}

/** Stati in cui l'ordine è ancora un documento di lavoro e si può riscrivere. */
export const STATI_MODIFICABILI: readonly SalesOrderStatus[] = ['BOZZA', 'PREVENTIVO'];

/**
 * Stati annullabili. Da `IMBALLATO` in poi la merce è già uscita dalla giacenza:
 * l'annullamento non basta più, serve un reso da cliente (movimento opposto).
 */
export const STATI_ANNULLABILI: readonly SalesOrderStatus[] = [
  'BOZZA',
  'PREVENTIVO',
  'CONFERMATO',
  'IN_PRELIEVO',
];

export function isStatoVendita(value: string | null): value is SalesOrderStatus {
  return (
    value !== null &&
    (
      [
        'BOZZA',
        'PREVENTIVO',
        'CONFERMATO',
        'IN_PRELIEVO',
        'IMBALLATO',
        'SPEDITO',
        'CONSEGNATO',
        'ANNULLATO',
      ] as string[]
    ).includes(value)
  );
}

/**
 * Filtro di periodo: si guarda la data d'ordine e, se non c'è ancora (bozze e
 * preventivi), la data di creazione. Senza il ripiego le bozze sparirebbero da
 * ogni ricerca per periodo.
 */
export function periodoWhere(
  da: string | null,
  a: string | null,
): Prisma.SalesOrderWhereInput | undefined {
  const inizio = da ? new Date(`${da}T00:00:00`) : null;
  const fine = a ? new Date(`${a}T23:59:59.999`) : null;
  if ((inizio && Number.isNaN(inizio.getTime())) || (fine && Number.isNaN(fine.getTime()))) {
    return undefined;
  }
  if (!inizio && !fine) return undefined;
  const range = {
    ...(inizio ? { gte: inizio } : {}),
    ...(fine ? { lte: fine } : {}),
  };
  return {
    OR: [{ orderedAt: range }, { orderedAt: null, createdAt: range }],
  };
}
