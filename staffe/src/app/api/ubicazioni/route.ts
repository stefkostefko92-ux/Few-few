import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { TIPI_UBICAZIONE, ubicazioneCreaSchema } from '@/lib/validation/prodotti';

/**
 * Ubicazioni: la gerarchia fisica Zona → Corsia → Scaffale → Ripiano → Vano.
 * `code` è l'etichetta stampata e scansionata, `pickOrder` l'ordine con cui
 * l'operatore attraversa il magazzino.
 */

function tipoValido(v: string | null): v is (typeof TIPI_UBICAZIONE)[number] {
  return v !== null && (TIPI_UBICAZIONE as readonly string[]).includes(v);
}

export const GET = route(async (request: Request) => {
  await requirePermission('ubicazioni:leggi');
  const url = new URL(request.url);
  const p = pagination(url, 50);

  const where: Prisma.LocationWhereInput = {};
  if (url.searchParams.get('attive') !== '0') where.active = true;

  const kind = url.searchParams.get('tipo');
  if (tipoValido(kind)) where.kind = kind;

  const zona = url.searchParams.get('zona');
  if (zona) where.zone = zona;

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q) {
    const contiene = { contains: q, mode: 'insensitive' as const };
    where.OR = [
      { code: contiene },
      { zone: contiene },
      { aisle: contiene },
      { rack: contiene },
      { notes: contiene },
    ];
  }

  const [total, ubicazioni] = await Promise.all([
    prisma.location.count({ where }),
    prisma.location.findMany({
      where,
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  // Occupazione: quante righe di giacenza e quanti pezzi contiene l'ubicazione.
  const occupazione = await prisma.stockItem.groupBy({
    by: ['locationId'],
    where: { locationId: { in: ubicazioni.map((u) => u.id) } },
    _sum: { qty: true },
    _count: { _all: true },
  });
  const perId = new Map(
    occupazione.map((o) => [o.locationId, { articoli: o._count._all, pezzi: o._sum.qty ?? 0 }]),
  );

  return ok(
    ubicazioni.map((u) => ({
      ...u,
      occupazione: perId.get(u.id) ?? { articoli: 0, pezzi: 0 },
    })),
    meta(p, total),
  );
});

export const POST = route(async (request: Request) => {
  const user = await requirePermission('ubicazioni:scrivi');
  const dati = await readBody(request, ubicazioneCreaSchema);

  const ubicazione = await prisma.location.create({
    data: { ...dati, code: dati.code.toUpperCase() },
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'Location',
    entityId: ubicazione.id,
    summary: `Creata ubicazione ${ubicazione.code}`,
    changes: dati,
  });

  return created(ubicazione);
});
