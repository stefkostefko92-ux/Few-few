import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import {
  COUNT_STATUS_LABELS,
  COUNT_TYPE_LABELS,
  formatDateTime,
} from '@/lib/labels';
import {
  STATI_INVENTARIO,
  TIPI_INVENTARIO,
} from '@/lib/validation/inventario';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { AccessoNegato, Paginazione, Vuoto } from '@/components/inventario/comuni';

export const metadata: Metadata = {
  title: 'Inventario',
  description:
    'Conteggi di inventario ciclici e totali: giacenza attesa, quantità contata e rapporto delle discrepanze.',
  keywords: [
    'Carbon Stealth',
    'inventario di magazzino',
    'conta ciclica',
    'discrepanze di giacenza',
    'staffe per ascensori',
    'gestionale WMS',
  ],
};

const PER_PAGINA = 25;

const TONO_STATO = {
  APERTO: 'neutro',
  IN_CORSO: 'corso',
  CHIUSO: 'ok',
  ANNULLATO: 'errore',
} as const;

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; tipo?: string; page?: string }>;
}) {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'inventario:leggi')) {
    return <AccessoNegato cosa="gli inventari" />;
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const stato = (STATI_INVENTARIO as readonly string[]).includes(sp.stato ?? '')
    ? (sp.stato as (typeof STATI_INVENTARIO)[number])
    : undefined;
  const tipo = (TIPI_INVENTARIO as readonly string[]).includes(sp.tipo ?? '')
    ? (sp.tipo as (typeof TIPI_INVENTARIO)[number])
    : undefined;

  const where: Prisma.InventoryCountWhereInput = {};
  if (stato) where.status = stato;
  if (tipo) where.type = tipo;

  const [totale, conteggi] = await Promise.all([
    prisma.inventoryCount.count({ where }),
    prisma.inventoryCount.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        startedAt: true,
        closedAt: true,
        user: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  // Avanzamento della conta: solo per i conteggi mostrati in questa pagina.
  const contatePerConteggio = new Map<string, number>();
  if (conteggi.length > 0) {
    const gruppi = await prisma.inventoryCountLine.groupBy({
      by: ['countId'],
      where: {
        countId: { in: conteggi.map((c) => c.id) },
        countedQty: { not: null },
      },
      _count: { _all: true },
    });
    for (const g of gruppi) contatePerConteggio.set(g.countId, g._count._all);
  }

  const params: Record<string, string> = {};
  if (stato) params.stato = stato;
  if (tipo) params.tipo = tipo;

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Conteggi ciclici e totali, con il rapporto delle differenze rispetto alla giacenza a sistema."
        actions={
          can(utente.role, 'inventario:scrivi') ? (
            <Link href="/inventario/nuovo">
              <Button>Nuovo conteggio</Button>
            </Link>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="stato" className="block text-sm font-medium">
            Stato
          </label>
          <Select id="stato" name="stato" defaultValue={stato ?? ''} className="mt-1 w-48">
            <option value="">Tutti</option>
            {STATI_INVENTARIO.map((s) => (
              <option key={s} value={s}>
                {COUNT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="tipo" className="block text-sm font-medium">
            Tipo
          </label>
          <Select id="tipo" name="tipo" defaultValue={tipo ?? ''} className="mt-1 w-48">
            <option value="">Tutti</option>
            {TIPI_INVENTARIO.map((t) => (
              <option key={t} value={t}>
                {COUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondario">
          Filtra
        </Button>
      </form>

      {conteggi.length === 0 ? (
        <EmptyState
          title="Nessun conteggio"
          description="Apri un conteggio ciclico su una zona o una categoria: bastano poche righe per volta per tenere la giacenza allineata."
          action={
            can(utente.role, 'inventario:scrivi') ? (
              <Link href="/inventario/nuovo">
                <Button>Nuovo conteggio</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Numero</Th>
              <Th>Tipo</Th>
              <Th>Stato</Th>
              <Th className="text-right">Righe</Th>
              <Th className="text-right">Contate</Th>
              <Th>Aperto</Th>
              <Th>Chiuso</Th>
              <Th>Operatore</Th>
            </tr>
          </thead>
          <tbody>
            {conteggi.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/inventario/${c.id}`} className="font-medium text-brand">
                    {c.number}
                  </Link>
                </Td>
                <Td>{COUNT_TYPE_LABELS[c.type]}</Td>
                <Td>
                  <Badge tone={TONO_STATO[c.status]}>
                    {COUNT_STATUS_LABELS[c.status]}
                  </Badge>
                </Td>
                <Td className="text-right tabular-nums">{c._count.lines}</Td>
                <Td className="text-right tabular-nums">
                  {contatePerConteggio.get(c.id) ?? 0}
                </Td>
                <Td>{formatDateTime(c.startedAt)}</Td>
                <Td>{c.closedAt ? formatDateTime(c.closedAt) : <Vuoto />}</Td>
                <Td>{c.user?.name ?? <Vuoto />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Paginazione
        base="/inventario"
        params={params}
        page={page}
        totalPages={Math.max(1, Math.ceil(totale / PER_PAGINA))}
        totale={totale}
      />
    </>
  );
}
