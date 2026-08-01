import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, fail, ok, readBody, route } from '@/lib/api';
import { contaSalvaSchema, rigaAggiuntaSchema } from '@/lib/validation/inventario';

type Contesto = { params: Promise<{ id: string }> };

/** Stati in cui il conteggio accetta ancora numeri. */
const MODIFICABILE = ['APERTO', 'IN_CORSO'] as const;

async function statoConteggio(id: string) {
  return prisma.inventoryCount.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
}

function bloccato(status: string) {
  if (status === 'CHIUSO') {
    return fail(
      409,
      'Inventario chiuso: le quantità non si modificano più.',
      'chiuso',
    );
  }
  return fail(
    409,
    'Inventario annullato: le quantità non si modificano più.',
    'annullato',
  );
}

/**
 * Salva le quantità contate. Arrivano a gruppi perché lo schermo di conteggio
 * lavora per ubicazione: l'operatore svuota un vano e salva tutta la schermata.
 *
 * `verified` è vero solo quando il codice a barre del prodotto è stato
 * scansionato: è ciò che distingue una conta controllata da una spunta a memoria.
 */
export const PATCH = route(async (request: Request, ctx: Contesto) => {
  const user = await requirePermission('inventario:scrivi');
  const { id } = await ctx.params;
  const { righe } = await readBody(request, contaSalvaSchema);

  const conteggio = await statoConteggio(id);
  if (!conteggio) return fail(404, 'Inventario non trovato.', 'non_trovato');
  if (!(MODIFICABILE as readonly string[]).includes(conteggio.status)) {
    return bloccato(conteggio.status);
  }

  // Le righe devono appartenere a QUESTO conteggio: senza il controllo, un
  // identificativo copiato da un altro inventario ne sporcherebbe le quantità.
  const esistenti = await prisma.inventoryCountLine.findMany({
    where: { countId: id, id: { in: righe.map((r) => r.lineId) } },
    select: { id: true },
  });
  if (esistenti.length !== righe.length) {
    return fail(
      422,
      'Alcune righe non appartengono a questo inventario: ricaricare la pagina.',
      'righe_estranee',
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const riga of righe) {
      await tx.inventoryCountLine.update({
        where: { id: riga.lineId },
        data: {
          countedQty: riga.countedQty,
          ...(riga.verified === undefined ? {} : { verified: riga.verified }),
          ...(riga.note === undefined ? {} : { note: riga.note }),
        },
      });
    }
    // Il primo numero salvato porta il conteggio «in corso»: lo stato racconta
    // da solo a che punto è, senza che nessuno debba premere un bottone.
    if (conteggio.status === 'APERTO') {
      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'IN_CORSO' },
      });
    }
  });

  await audit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'InventoryCountLine',
    entityId: id,
    summary: `Inventario ${conteggio.number}: salvate ${righe.length} righe contate`,
  });

  const [totali, contate] = await Promise.all([
    prisma.inventoryCountLine.count({ where: { countId: id } }),
    prisma.inventoryCountLine.count({
      where: { countId: id, countedQty: { not: null } },
    }),
  ]);

  return ok({ salvate: righe.length, righe: totali, contate });
});

/**
 * Aggiunge una riga per merce trovata dove il sistema non ne prevede.
 *
 * L'atteso si rilegge dalla giacenza nel momento in cui la riga nasce (di norma
 * zero): senza questa possibilità l'eccedenza resterebbe fuori dal verbale e la
 * giacenza continuerebbe a mentire.
 */
export const POST = route(async (request: Request, ctx: Contesto) => {
  const user = await requirePermission('inventario:scrivi');
  const { id } = await ctx.params;
  const input = await readBody(request, rigaAggiuntaSchema);

  const conteggio = await statoConteggio(id);
  if (!conteggio) return fail(404, 'Inventario non trovato.', 'non_trovato');
  if (!(MODIFICABILE as readonly string[]).includes(conteggio.status)) {
    return bloccato(conteggio.status);
  }

  const [prodotto, ubicazione] = await Promise.all([
    // Dallo scanner arriva un codice, non un identificativo: si risolve qui.
    input.productId
      ? prisma.product.findUnique({
          where: { id: input.productId },
          select: { id: true, sku: true, name: true },
        })
      : prisma.product.findFirst({
          where: {
            active: true,
            OR: [{ sku: input.codice ?? '' }, { barcode: input.codice ?? '' }],
          },
          select: { id: true, sku: true, name: true },
        }),
    prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, code: true },
    }),
  ]);
  if (!prodotto) {
    return fail(
      404,
      input.codice
        ? `Nessun prodotto attivo con codice ${input.codice}.`
        : 'Prodotto non trovato.',
      'non_trovato',
    );
  }
  if (!ubicazione) return fail(404, 'Ubicazione non trovata.', 'non_trovato');

  const gia = await prisma.inventoryCountLine.findUnique({
    where: {
      countId_productId_locationId: {
        countId: id,
        productId: prodotto.id,
        locationId: input.locationId,
      },
    },
    select: { id: true },
  });
  if (gia) {
    return fail(
      409,
      `${prodotto.sku} è già in elenco per l’ubicazione ${ubicazione.code}: aggiornare quella riga.`,
      'riga_esistente',
    );
  }

  const riga = await prisma.$transaction(async (tx) => {
    const giacenza = await tx.stockItem.aggregate({
      where: { productId: prodotto.id, locationId: input.locationId },
      _sum: { qty: true },
    });
    const creata = await tx.inventoryCountLine.create({
      data: {
        countId: id,
        productId: prodotto.id,
        locationId: input.locationId,
        expectedQty: giacenza._sum.qty ?? 0,
        countedQty: input.countedQty,
        verified: input.verified,
        note: input.note,
      },
      select: {
        id: true,
        expectedQty: true,
        countedQty: true,
        verified: true,
        note: true,
      },
    });
    if (conteggio.status === 'APERTO') {
      await tx.inventoryCount.update({
        where: { id },
        data: { status: 'IN_CORSO' },
      });
    }
    return creata;
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'InventoryCountLine',
    entityId: riga.id,
    summary: `Inventario ${conteggio.number}: riga aggiunta ${prodotto.sku} in ${ubicazione.code} (contati ${input.countedQty})`,
  });

  return created(riga);
});
