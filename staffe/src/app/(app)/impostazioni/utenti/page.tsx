import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { ROLE_LABELS, can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/labels';
import { RUOLI } from '@/lib/validation/inventario';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { AccessoNegato, Paginazione, Vuoto } from '@/components/inventario/comuni';

export const metadata: Metadata = {
  title: 'Utenti',
  description:
    'Gestione degli utenti del gestionale: ruoli, attivazione e reimpostazione della password.',
  keywords: [
    'Carbon Stealth',
    'gestione utenti',
    'ruoli e permessi',
    'magazzino ascensori',
    'sicurezza accessi',
    'gestionale WMS',
  ],
};

const PER_PAGINA = 25;

export default async function UtentiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ruolo?: string; stato?: string; page?: string }>;
}) {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'utenti:gestisci')) {
    return <AccessoNegato cosa="gli utenti" />;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = (sp.q ?? '').trim();
  const ruolo = (RUOLI as readonly string[]).includes(sp.ruolo ?? '')
    ? (sp.ruolo as (typeof RUOLI)[number])
    : undefined;
  const stato = sp.stato === 'attivi' || sp.stato === 'disattivati' ? sp.stato : undefined;

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (ruolo) where.role = ruolo;
  if (stato) where.active = stato === 'attivi';

  const [totale, utenti] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      // Mai `passwordHash`: un hash che esce dal server è un hash che qualcuno
      // prova a rompere con comodo.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
  ]);

  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (ruolo) params.ruolo = ruolo;
  if (stato) params.stato = stato;

  return (
    <>
      <PageHeader
        title="Utenti"
        description="Chi entra nel gestionale e con quale ruolo. Gli utenti non si cancellano: si disattivano, così la storia dei documenti resta leggibile."
        actions={
          <Link href="/impostazioni/utenti/nuovo">
            <Button>Nuovo utente</Button>
          </Link>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="block text-sm font-medium">
            Cerca
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            className="mt-1 w-56"
            placeholder="Nome o e-mail"
          />
        </div>
        <div>
          <label htmlFor="ruolo" className="block text-sm font-medium">
            Ruolo
          </label>
          <Select id="ruolo" name="ruolo" defaultValue={ruolo ?? ''} className="mt-1 w-56">
            <option value="">Tutti</option>
            {RUOLI.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="stato" className="block text-sm font-medium">
            Stato
          </label>
          <Select id="stato" name="stato" defaultValue={stato ?? ''} className="mt-1 w-40">
            <option value="">Tutti</option>
            <option value="attivi">Attivi</option>
            <option value="disattivati">Disattivati</option>
          </Select>
        </div>
        <Button type="submit" variant="secondario">
          Filtra
        </Button>
      </form>

      {utenti.length === 0 ? (
        <EmptyState
          title="Nessun utente"
          description="Nessun utente corrisponde ai filtri scelti."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>E-mail</Th>
              <Th>Ruolo</Th>
              <Th>Stato</Th>
              <Th>Ultimo accesso</Th>
            </tr>
          </thead>
          <tbody>
            {utenti.map((u) => (
              <tr key={u.id}>
                <Td>
                  <Link
                    href={`/impostazioni/utenti/${u.id}`}
                    className="font-medium text-brand"
                  >
                    {u.name}
                  </Link>
                  {u.id === utente.id && (
                    <span className="ml-2 text-xs text-fg-muted">(tu)</span>
                  )}
                </Td>
                <Td>{u.email}</Td>
                <Td>{ROLE_LABELS[u.role]}</Td>
                <Td>
                  {u.active ? (
                    <Badge tone="ok">Attivo</Badge>
                  ) : (
                    <Badge tone="errore">Disattivato</Badge>
                  )}
                </Td>
                <Td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <Vuoto />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Paginazione
        base="/impostazioni/utenti"
        params={params}
        page={page}
        totalPages={Math.max(1, Math.ceil(totale / PER_PAGINA))}
        totale={totale}
      />
    </>
  );
}
