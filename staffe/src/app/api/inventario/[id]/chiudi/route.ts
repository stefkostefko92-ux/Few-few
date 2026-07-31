import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { StockError, applyMovement, checkLowStock, stockKeyOf } from '@/lib/stock';
import { formatCents } from '@/lib/money';
import { fail, ok, readBody, route } from '@/lib/api';
import { chiusuraSchema } from '@/lib/validation/inventario';
import {
  discrepanzaRilevante,
  livelloDiscrepanza,
  riepiloga,
} from '@/components/inventario/rapporto';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Chiusura dell'inventario — tutto in UNA transazione.
 *
 * Per ogni riga con differenza si scrive un movimento `INVENTARIO`
 * (`toLocationId` per l'eccedenza, `fromLocationId` per l'ammanco: la giacenza
 * cambia solo attraverso `applyMovement`, mai con una `update` diretta). Se una
 * sola rettifica fallisce, cade tutto: un inventario chiuso a metà lascerebbe il
 * magazzino in uno stato che nessun documento spiega.
 *
 * Un inventario chiuso non si riapre e non si modifica.
 */
export const POST = route(async (request: Request, ctx: Contesto) => {
  const user = await requirePermission('inventario:scrivi');
  const { id } = await ctx.params;
  const { forza } = await readBody(request, chiusuraSchema);

  const testata = await prisma.inventoryCount.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
  if (!testata) return fail(404, 'Inventario non trovato.', 'non_trovato');
  if (testata.status === 'CHIUSO') {
    return fail(409, 'Inventario già chiuso.', 'chiuso');
  }
  if (testata.status === 'ANNULLATO') {
    return fail(409, 'Inventario annullato: non si può chiudere.', 'annullato');
  }

  const nonContate = await prisma.inventoryCountLine.count({
    where: { countId: id, countedQty: null },
  });
  if (nonContate > 0 && !forza) {
    // «Non contato» non è «zero»: chiudere senza avviso trasformerebbe una riga
    // dimenticata in un ammanco totale, con tanto di movimento in registro.
    return fail(
      422,
      `Ci sono ${nonContate} righe non ancora contate. Contarle oppure confermare la chiusura lasciandole invariate.`,
      'righe_non_contate',
    );
  }

  const esito = await prisma.$transaction(
    async (tx) => {
      const conteggio = await tx.inventoryCount.findUnique({
        where: { id },
        select: {
          id: true,
          number: true,
          status: true,
          lines: {
            select: {
              id: true,
              expectedQty: true,
              countedQty: true,
              locationId: true,
              location: { select: { code: true } },
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  costCents: true,
                  batchTracked: true,
                },
              },
            },
          },
        },
      });
      // Rilettura dentro la transazione: due operatori che premono «chiudi»
      // insieme non devono generare due serie di rettifiche.
      if (!conteggio || conteggio.status !== testata.status) {
        throw new StockError(
          'Lo stato dell’inventario è cambiato: ricaricare la pagina.',
        );
      }

      const riepilogo = riepiloga(
        conteggio.lines.map((r) => ({
          id: r.id,
          expectedQty: r.expectedQty,
          countedQty: r.countedQty,
          costCents: r.product.costCents,
        })),
      );

      const prodottiToccati = new Set<string>();
      let rettifiche = 0;

      for (const riga of conteggio.lines) {
        if (riga.countedQty === null) continue;
        const differenza = riga.countedQty - riga.expectedQty;
        if (differenza === 0) continue;

        // Limite noto dello schema: la riga di inventario non ha lotto. Su un
        // prodotto a lotti l'ammanco non sarebbe attribuibile, quindi ci si
        // ferma invece di scaricare dal mucchio sbagliato.
        if (differenza < 0 && riga.product.batchTracked) {
          const senzaLotto = await tx.stockItem.findUnique({
            where: {
              stockKey: stockKeyOf(riga.product.id, riga.locationId, null),
            },
            select: { qty: true },
          });
          if (!senzaLotto || senzaLotto.qty < -differenza) {
            throw new StockError(
              `${riga.product.sku} è gestito a lotti: l’ammanco in ${riga.location.code} va rettificato indicando il lotto, non dall’inventario.`,
            );
          }
        }

        await applyMovement(tx, {
          productId: riga.product.id,
          qty: Math.abs(differenza),
          type: 'INVENTARIO',
          // Eccedenza → la merce entra; ammanco → la merce esce.
          toLocationId: differenza > 0 ? riga.locationId : null,
          fromLocationId: differenza < 0 ? riga.locationId : null,
          unitCostCents: riga.product.costCents,
          reason: `Inventario ${conteggio.number}: attesi ${riga.expectedQty}, contati ${riga.countedQty}`,
          refType: 'InventoryCount',
          refId: conteggio.id,
          userId: user.id,
        });
        rettifiche += 1;
        prodottiToccati.add(riga.product.id);
      }

      // Le rettifiche possono portare un prodotto sotto scorta: la notifica di
      // riordino si aggiorna qui, non al prossimo prelievo.
      for (const productId of prodottiToccati) {
        await checkLowStock(tx, productId);
      }

      if (discrepanzaRilevante(riepilogo)) {
        await tx.notification.create({
          data: {
            type: 'INVENTARIO_DISCREPANZA',
            level: livelloDiscrepanza(riepilogo),
            title: `Discrepanze inventario ${conteggio.number}`,
            body: `${riepilogo.discordanti} righe con differenza · ${riepilogo.pezziInPiu} pezzi in più, ${riepilogo.pezziInMeno} in meno · impatto ${formatCents(riepilogo.valoreNettoCents)}.`,
            entity: 'InventoryCount',
            entityId: conteggio.id,
          },
        });
      }

      await tx.inventoryCount.update({
        where: { id: conteggio.id },
        data: { status: 'CHIUSO', closedAt: new Date() },
      });

      return { numero: conteggio.number, rettifiche, riepilogo };
    },
    { timeout: 60_000 },
  );

  await audit({
    userId: user.id,
    action: 'CHIUSURA',
    entity: 'InventoryCount',
    entityId: id,
    summary: `Inventario ${esito.numero} chiuso: ${esito.rettifiche} rettifiche su ${esito.riepilogo.righe} righe`,
    changes: {
      discordanti: esito.riepilogo.discordanti,
      nonContate: esito.riepilogo.nonContate,
      pezziInPiu: esito.riepilogo.pezziInPiu,
      pezziInMeno: esito.riepilogo.pezziInMeno,
      valoreNettoCents: esito.riepilogo.valoreNettoCents,
    },
  });

  return ok(esito);
});
