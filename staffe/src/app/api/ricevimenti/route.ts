import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { created, fail, meta, ok, pagination, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { nextDocumentNumber } from '@/lib/sequence';
import { applyMovement } from '@/lib/stock';
import {
  creaRicevimentoSchema,
  statoDaRighe,
  whereRicevimenti,
} from '@/lib/validation/acquisti';

/**
 * Ricevimento merce — l'unico ingresso della merce in magazzino.
 *
 * Tutto ciò che il documento comporta sta in UNA transazione: numero documento,
 * righe, movimenti di giacenza, avanzamento dell'ordine di acquisto e notifica.
 * Se una sola di queste scritture fallisce non deve restarne nessuna: un
 * ricevimento a metà è merce che risulta a sistema senza documento (o viceversa)
 * e la differenza inventariale diventa inspiegabile.
 *
 * La giacenza cambia solo tramite `applyMovement`, mai scrivendo `StockItem`.
 */

/** Le righe possono essere molte: la transazione ha bisogno di più dei 5s standard. */
const TIMEOUT_TRANSAZIONE_MS = 20_000;

export const GET = route(async (request: Request) => {
  await requirePermission('acquisti:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const where = whereRicevimenti({
    fornitore: url.searchParams.get('fornitore'),
    dal: url.searchParams.get('dal'),
    al: url.searchParams.get('al'),
    q: url.searchParams.get('q'),
  });

  const [ricevimenti, totale] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }],
      skip: p.skip,
      take: p.take,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.goodsReceipt.count({ where }),
  ]);

  return ok(ricevimenti, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const utente = await requirePermission('ricevimenti:scrivi');
  const dati = await readBody(request, creaRicevimentoSchema);
  const arrivoIl = dati.receivedAt ?? new Date();

  // ── 1. Ordine di acquisto collegato (facoltativo) ──────────────────────────
  const ordine = dati.purchaseOrderId
    ? await prisma.purchaseOrder.findUnique({
        where: { id: dati.purchaseOrderId },
        include: { lines: { include: { product: { select: { sku: true } } } } },
      })
    : null;

  if (dati.purchaseOrderId && !ordine) {
    return fail(404, 'Ordine di acquisto non trovato.', 'non_trovato');
  }
  if (ordine && ordine.status === 'BOZZA') {
    return fail(409, 'L’ordine è ancora in bozza: confermarlo prima di ricevere la merce.', 'stato');
  }
  if (ordine && ordine.status === 'ANNULLATO') {
    return fail(409, 'L’ordine è annullato: non è possibile registrare un ricevimento.', 'stato');
  }

  // ── 2. Fornitore ───────────────────────────────────────────────────────────
  const idFornitore = ordine?.supplierId ?? dati.supplierId ?? null;
  if (!idFornitore) {
    return fail(422, 'Indicare un ordine di acquisto oppure un fornitore.', 'fornitore');
  }
  const fornitore = await prisma.supplier.findUnique({
    where: { id: idFornitore },
    select: { id: true, name: true, active: true },
  });
  if (!fornitore) return fail(422, 'Fornitore non trovato.', 'fornitore');

  // ── 3. Prodotti, ubicazioni, lotti ─────────────────────────────────────────
  const idProdotti = [...new Set(dati.righe.map((r) => r.productId))];
  const idUbicazioni = [...new Set(dati.righe.map((r) => r.locationId))];

  const [prodotti, ubicazioni] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: idProdotti } },
      select: { id: true, sku: true, name: true, active: true, batchTracked: true, costCents: true },
    }),
    prisma.location.findMany({
      where: { id: { in: idUbicazioni } },
      select: { id: true, code: true, active: true },
    }),
  ]);
  const prodottoPerId = new Map(prodotti.map((p) => [p.id, p]));
  const ubicazionePerId = new Map(ubicazioni.map((l) => [l.id, l]));
  const rigaOrdinePerId = new Map((ordine?.lines ?? []).map((l) => [l.id, l]));

  for (const r of dati.righe) {
    const prodotto = prodottoPerId.get(r.productId);
    if (!prodotto) return fail(422, 'Una delle righe indica un prodotto inesistente.', 'prodotto');
    if (!prodotto.active) {
      return fail(422, `Il prodotto ${prodotto.sku} è disattivato: non può essere ricevuto.`, 'prodotto');
    }

    const ubicazione = ubicazionePerId.get(r.locationId);
    if (!ubicazione) return fail(422, 'Una delle righe indica un’ubicazione inesistente.', 'ubicazione');
    if (!ubicazione.active) {
      return fail(422, `L’ubicazione ${ubicazione.code} è disattivata.`, 'ubicazione');
    }

    // Il lotto è obbligatorio esattamente dove serve: senza, la tracciabilità
    // del prodotto a lotti si interrompe al primo ricevimento.
    if (prodotto.batchTracked && !r.lotto) {
      return fail(422, `Il prodotto ${prodotto.sku} è gestito a lotti: indicare il lotto.`, 'lotto');
    }
    if (!prodotto.batchTracked && r.lotto) {
      return fail(422, `Il prodotto ${prodotto.sku} non è gestito a lotti.`, 'lotto');
    }

    if (r.purchaseLineId) {
      const riga = rigaOrdinePerId.get(r.purchaseLineId);
      if (!riga) {
        return fail(422, 'Una riga fa riferimento a una riga d’ordine non appartenente a questo ordine.', 'riga');
      }
      if (riga.productId !== r.productId) {
        return fail(422, 'Il prodotto ricevuto non corrisponde a quello della riga d’ordine.', 'riga');
      }
    }
  }

  // ── 4. Eccedenza rispetto all'ordinato ─────────────────────────────────────
  // Mai un blocco silenzioso: si dice quale riga sfora e di quanto, e si
  // procede solo se l'operatore conferma esplicitamente.
  const perRigaOrdine = new Map<string, number>();
  for (const r of dati.righe) {
    if (!r.purchaseLineId) continue;
    perRigaOrdine.set(r.purchaseLineId, (perRigaOrdine.get(r.purchaseLineId) ?? 0) + r.qty);
  }
  const eccedenze = [...perRigaOrdine.entries()]
    .map(([idRiga, qty]) => {
      const riga = rigaOrdinePerId.get(idRiga);
      if (!riga) return null;
      const totale = riga.receivedQty + qty;
      if (totale <= riga.qty) return null;
      return {
        sku: riga.product.sku,
        ordinato: riga.qty,
        giaRicevuto: riga.receivedQty,
        inRicevimento: qty,
        eccedenza: totale - riga.qty,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (eccedenze.length > 0 && !dati.consentiEccedenza) {
    return fail(
      409,
      'La quantità ricevuta supera quella ordinata. Confermare l’eccedenza per procedere.',
      'eccedenza',
      eccedenze,
    );
  }

  // ── 5. Il documento, in una sola transazione ───────────────────────────────
  const ricevimento = await prisma.$transaction(
    async (tx) => {
      const numero = await nextDocumentNumber(tx, 'ricevimento');

      const documento = await tx.goodsReceipt.create({
        data: {
          number: numero,
          purchaseOrderId: ordine?.id ?? null,
          supplierId: fornitore.id,
          invoiceNumber: dati.invoiceNumber ?? null,
          receivedAt: arrivoIl,
          notes: dati.notes ?? null,
          userId: utente.id,
        },
      });

      for (const r of dati.righe) {
        const prodotto = prodottoPerId.get(r.productId)!;
        const rigaOrdine = r.purchaseLineId ? rigaOrdinePerId.get(r.purchaseLineId) : undefined;

        // Costo deciso dal server: quello dichiarato, altrimenti quello
        // dell'ordine, altrimenti il costo di listino del prodotto.
        const costoUnitario = r.unitCostCents ?? rigaOrdine?.unitCostCents ?? prodotto.costCents;

        let idLotto: string | null = null;
        if (r.lotto) {
          const lotto = await tx.batch.upsert({
            where: { productId_code: { productId: r.productId, code: r.lotto } },
            create: {
              productId: r.productId,
              code: r.lotto,
              supplierLot: r.lotto,
              receivedAt: arrivoIl,
              expiresAt: r.scadenza ?? null,
            },
            update: r.scadenza ? { expiresAt: r.scadenza } : {},
          });
          idLotto = lotto.id;
        }

        await tx.goodsReceiptLine.create({
          data: {
            receiptId: documento.id,
            purchaseLineId: r.purchaseLineId ?? null,
            productId: r.productId,
            locationId: r.locationId,
            batchId: idLotto,
            qty: r.qty,
            unitCostCents: costoUnitario,
            note: r.note ?? null,
          },
        });

        // Unico punto in cui la giacenza aumenta: il movimento è la spiegazione
        // della quantità, non un effetto collaterale.
        await applyMovement(tx, {
          productId: r.productId,
          qty: r.qty,
          type: 'RICEVIMENTO',
          toLocationId: r.locationId,
          batchId: idLotto,
          unitCostCents: costoUnitario,
          reason: `Ricevimento ${numero}`,
          refType: 'GoodsReceipt',
          refId: documento.id,
          userId: utente.id,
        });

        if (r.purchaseLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: r.purchaseLineId },
            data: { receivedQty: { increment: r.qty } },
          });
        }
      }

      // Avanzamento dell'ordine, ricalcolato dalle righe appena aggiornate.
      if (ordine) {
        const righe = await tx.purchaseOrderLine.findMany({
          where: { orderId: ordine.id },
          select: { qty: true, receivedQty: true },
        });
        const nuovoStato = statoDaRighe(ordine.status, righe);
        if (nuovoStato !== ordine.status) {
          await tx.purchaseOrder.update({
            where: { id: ordine.id },
            data: {
              status: nuovoStato,
              receivedAt: nuovoStato === 'RICEVUTO' ? arrivoIl : null,
            },
          });
        }
      }

      await tx.notification.create({
        data: {
          type: 'ACQUISTO_RICEVUTO',
          level: 'INFO',
          title: `Merce ricevuta — ${numero}`,
          body: `${dati.righe.length} righe da ${fornitore.name}${
            ordine ? ` per l’ordine ${ordine.number}` : ' (senza ordine)'
          }.`,
          entity: 'GoodsReceipt',
          entityId: documento.id,
        },
      });

      return documento;
    },
    { timeout: TIMEOUT_TRANSAZIONE_MS },
  );

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'GoodsReceipt',
    entityId: ricevimento.id,
    summary: `Ricevimento ${ricevimento.number} — ${fornitore.name}${ordine ? ` (ordine ${ordine.number})` : ''}`,
    changes: {
      righe: dati.righe.length,
      pezzi: dati.righe.reduce((a, r) => a + r.qty, 0),
      ordine: ordine?.number ?? null,
      fattura: dati.invoiceNumber ?? null,
      eccedenzaConfermata: eccedenze.length > 0,
    } satisfies Prisma.InputJsonObject,
  });

  return created(ricevimento);
});
