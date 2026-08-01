import { Prisma } from '@prisma/client';
import { hashPassword, requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, fail, meta, ok, pagination, readBody, route } from '@/lib/api';
import { RUOLI, utenteCreaSchema } from '@/lib/validation/inventario';

/**
 * Campi restituiti dalle rotte utenti. `passwordHash` non compare MAI: un hash
 * che esce dal server è un hash che qualcuno prima o poi prova a rompere fuori
 * dalla nostra vista.
 */
const CAMPI = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const GET = route(async (request: Request) => {
  await requirePermission('utenti:gestisci');

  const url = new URL(request.url);
  const p = pagination(url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const ruolo = url.searchParams.get('ruolo');
  const stato = url.searchParams.get('stato'); // attivi | disattivati | tutti

  const where: Prisma.UserWhereInput = {};
  if (q.length > 0) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (ruolo && (RUOLI as readonly string[]).includes(ruolo)) {
    where.role = ruolo as (typeof RUOLI)[number];
  }
  if (stato === 'attivi') where.active = true;
  if (stato === 'disattivati') where.active = false;

  const [totale, utenti] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: CAMPI,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  return ok(utenti, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const attore = await requirePermission('utenti:gestisci');
  const input = await readBody(request, utenteCreaSchema);

  const esistente = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, active: true },
  });
  if (esistente) {
    // Non si «riusa» un indirizzo esistente creando un doppione: l'utente
    // disattivato va riattivato, così la sua storia resta collegata.
    return fail(
      409,
      esistente.active
        ? 'Esiste già un utente con questo indirizzo e-mail.'
        : 'Esiste già un utente disattivato con questo indirizzo: riattivarlo invece di crearne uno nuovo.',
      'duplicato',
    );
  }

  const utente = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      // La password non viene mai memorizzata né registrata in chiaro.
      passwordHash: await hashPassword(input.password),
    },
    select: CAMPI,
  });

  await audit({
    userId: attore.id,
    action: 'CREATE',
    entity: 'User',
    entityId: utente.id,
    summary: `Creato utente ${utente.email} (${utente.role})`,
    changes: { name: utente.name, email: utente.email, role: utente.role },
  });

  return created(utente);
});
