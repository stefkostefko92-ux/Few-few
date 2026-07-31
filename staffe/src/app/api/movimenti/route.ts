import type { Prisma } from '@prisma/client';
import { requirePermission, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, fail, meta, ok, pagination, readBody, route } from '@/lib/api';
import { moveStock, type MovementInput } from '@/lib/stock';
import { movimentoManualeSchema, TIPI_MOVIMENTO } from '@/lib/validation/prodotti';

/**
 * Registro dei movimenti di magazzino.
 *
 * In lettura è il libro mastro della giacenza: ogni variazione ha una riga.
 * In scrittura accetta soltanto i due movimenti che nascono da una decisione
 * dell'operatore — trasferimento e rettifica. Ricevimenti, prelievi e
 * spedizioni li scrive il documento che li genera, non questo endpoint.
 */

function tipoValido(v: string | null): v is (typeof TIPI_MOVIMENTO)[number] {
  return v !== null && (TIPI_MOVIMENTO as readonly string[]).includes(v);
}

function dataValida(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = route(async (request: Request) => {
  await requirePermission('giacenze:leggi');
  const url = new URL(request.url);
  const p = pagination(url, 50);

  const where: Prisma.StockMovementWhereInput = {};

  const tipo = url.searchParams.get('tipo');
  if (tipoValido(tipo)) where.type = tipo;

  const prodottoId = url.searchParams.get('prodottoId');
  if (prodottoId) where.productId = prodottoId;

  const ubicazioneId = url.searchParams.get('ubicazioneId');
  if (ubicazioneId) {
    where.OR = [{ fromLocationId: ubicazioneId }, { toLocationId: ubicazioneId }];
  }

  const da = dataValida(url.searchParams.get('da'));
  const a = dataValida(url.searchParams.get('a'));
  if (da || a) {
    where.createdAt = {
      ...(da ? { gte: da } : {}),
      // La data «a» è inclusiva: chi filtra fino al 31 si aspetta di vedere il 31.
      ...(a ? { lte: new Date(a.getTime() + 86_399_999) } : {}),
    };
  }

  const [total, movimenti] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true, uom: true } },
        batch: { select: { id: true, code: true } },
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: p.skip,
      take: p.take,
    }),
  ]);

  return ok(movimenti, meta(p, total));
});

export const POST = route(async (request: Request) => {
  await requireUser();
  const dati = await readBody(request, movimentoManualeSchema);

  // La rettifica cambia la giacenza senza un documento a monte: è il permesso
  // più stretto del modulo e non coincide con quello dei trasferimenti.
  const user = await requirePermission(
    dati.type === 'RETTIFICA' ? 'giacenze:rettifica' : 'giacenze:muovi',
  );

  const prodotto = await prisma.product.findUnique({
    where: { id: dati.productId },
    select: { id: true, sku: true, name: true, active: true, costCents: true },
  });
  if (!prodotto) return fail(404, 'Prodotto non trovato.', 'non_trovato');
  if (!prodotto.active) {
    return fail(409, 'Il prodotto è disattivato: non è movimentabile.', 'prodotto_inattivo');
  }

  const ubicazioniRichieste =
    dati.type === 'TRASFERIMENTO'
      ? [dati.fromLocationId, dati.toLocationId]
      : [dati.locationId];

  const ubicazioni = await prisma.location.findMany({
    where: { id: { in: ubicazioniRichieste } },
    select: { id: true, code: true, active: true },
  });
  if (ubicazioni.length !== new Set(ubicazioniRichieste).size) {
    return fail(404, 'Ubicazione non trovata.', 'non_trovato');
  }
  const inattiva = ubicazioni.find((u) => !u.active);
  if (inattiva) {
    return fail(409, `L’ubicazione ${inattiva.code} è disattivata.`, 'ubicazione_inattiva');
  }
  const codice = new Map(ubicazioni.map((u) => [u.id, u.code]));

  const input: MovementInput =
    dati.type === 'TRASFERIMENTO'
      ? {
          productId: dati.productId,
          qty: dati.qty,
          type: 'TRASFERIMENTO',
          fromLocationId: dati.fromLocationId,
          toLocationId: dati.toLocationId,
          batchId: dati.batchId,
          unitCostCents: prodotto.costCents,
          reason: dati.reason ?? undefined,
          userId: user.id,
        }
      : {
          productId: dati.productId,
          qty: dati.qty,
          type: 'RETTIFICA',
          // Aumento = la merce entra nell'ubicazione, diminuzione = ne esce.
          fromLocationId: dati.verso === 'diminuzione' ? dati.locationId : null,
          toLocationId: dati.verso === 'aumento' ? dati.locationId : null,
          batchId: dati.batchId,
          unitCostCents: prodotto.costCents,
          reason: dati.reason,
          userId: user.id,
        };

  // Unica via consentita alla quantità: il motore scrive giacenza e movimento
  // nella stessa transazione e rifiuta i saldi negativi.
  const movimento = await moveStock(input);

  const descrizione =
    dati.type === 'TRASFERIMENTO'
      ? `Trasferiti ${dati.qty} × ${prodotto.sku} da ${codice.get(dati.fromLocationId)} a ${codice.get(dati.toLocationId)}`
      : `Rettifica ${dati.verso === 'aumento' ? '+' : '−'}${dati.qty} × ${prodotto.sku} in ${codice.get(dati.locationId)} — ${dati.reason}`;

  await audit({
    userId: user.id,
    action: dati.type === 'RETTIFICA' ? 'ADJUST' : 'MOVE',
    entity: 'StockMovement',
    entityId: movimento.id,
    summary: descrizione,
    changes: dati,
  });

  return created(movimento);
});
