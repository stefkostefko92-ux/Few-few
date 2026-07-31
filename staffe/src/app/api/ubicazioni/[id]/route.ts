import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { ubicazioneAggiornaSchema } from '@/lib/validation/prodotti';

type Contesto = { params: Promise<{ id: string }> };

const ULTIMI_MOVIMENTI = 20;

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('ubicazioni:leggi');
  const { id } = await params;

  const ubicazione = await prisma.location.findUnique({ where: { id } });
  if (!ubicazione) return fail(404, 'Ubicazione non trovata.', 'non_trovato');

  const [contenuto, movimenti, predefinitaPer] = await Promise.all([
    prisma.stockItem.findMany({
      where: { locationId: id },
      select: {
        id: true,
        qty: true,
        reservedQty: true,
        batch: { select: { id: true, code: true } },
        product: {
          select: { id: true, sku: true, name: true, uom: true, minStock: true },
        },
      },
      orderBy: [{ qty: 'desc' }],
    }),
    prisma.stockMovement.findMany({
      where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ULTIMI_MOVIMENTI,
    }),
    prisma.product.count({ where: { defaultLocationId: id, active: true } }),
  ]);

  return ok({
    ...ubicazione,
    contenuto,
    movimenti,
    predefinitaPer,
    occupazione: {
      articoli: contenuto.length,
      pezzi: contenuto.reduce((s, r) => s + r.qty, 0),
    },
  });
});

export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const user = await requirePermission('ubicazioni:scrivi');
  const { id } = await params;
  const dati = await readBody(request, ubicazioneAggiornaSchema);

  const attuale = await prisma.location.findUnique({ where: { id } });
  if (!attuale) return fail(404, 'Ubicazione non trovata.', 'non_trovato');

  // Un'ubicazione che contiene merce non può essere disattivata: la giacenza
  // resterebbe fisicamente lì ma invisibile ai giri di prelievo.
  if (dati.active === false) {
    const somma = await prisma.stockItem.aggregate({
      where: { locationId: id },
      _sum: { qty: true },
    });
    if ((somma._sum.qty ?? 0) > 0) {
      return fail(
        409,
        'L’ubicazione contiene ancora merce: trasferiscila prima di disattivarla.',
        'giacenza',
      );
    }
  }

  const ubicazione = await prisma.location.update({
    where: { id },
    data: dati.code ? { ...dati, code: dati.code.toUpperCase() } : dati,
  });

  await audit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'Location',
    entityId: id,
    summary: `Modificata ubicazione ${ubicazione.code}`,
    changes: dati,
  });

  return ok(ubicazione);
});
