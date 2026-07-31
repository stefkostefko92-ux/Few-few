import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { statoSpedizione } from '@/components/vendite/spedizione-stato';

export const metadata: Metadata = {
  title: 'Spedizioni',
  description:
    'Spedizioni: corriere, tracciatura, colli e peso, dallo stato «da imballare» alla consegna.',
  keywords: [
    'Carbon Stealth',
    'spedizioni',
    'numero di tracking',
    'corriere e colli',
    'ordini di vendita',
    'gestionale magazzino ascensori',
  ],
};

const PER_PAGINA = 25;

const FILTRI: Record<string, Prisma.ShipmentWhereInput> = {
  da_imballare: { packedAt: null },
  pronte: { packedAt: { not: null }, shippedAt: null },
  spedite: { shippedAt: { not: null }, deliveredAt: null },
  consegnate: { deliveredAt: { not: null } },
};

export default async function SpedizioniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const stato = uno(sp.stato);
  const q = uno(sp.q).trim();
  const pagina = Math.max(1, Number.parseInt(uno(sp.pagina) || '1', 10) || 1);

  const contiene = { contains: q, mode: 'insensitive' as const };
  const where: Prisma.ShipmentWhereInput = {
    ...(FILTRI[stato] ?? {}),
    ...(q
      ? {
          OR: [
            { number: contiene },
            { trackingNumber: contiene },
            { salesOrder: { number: contiene } },
            { salesOrder: { customer: { name: contiene } } },
          ],
        }
      : {}),
  };

  const [spedizioni, totale] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        salesOrder: {
          select: { id: true, number: true, customer: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.shipment.count({ where }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const puoSpedire = can(utente.role, 'spedizioni:scrivi');

  return (
    <>
      <PageHeader
        title="Spedizioni"
        description="Dalla merce imballata alla consegna, con la tracciatura del corriere."
        actions={
          puoSpedire ? (
            <Link href="/spedizioni/nuovo">
              <Button>Nuova spedizione</Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Cerca" htmlFor="f-q" hint="Numero, tracking, ordine o cliente.">
            <Input id="f-q" name="q" type="search" defaultValue={q} />
          </Field>
          <Field label="Stato" htmlFor="f-stato">
            <Select id="f-stato" name="stato" defaultValue={stato}>
              <option value="">Tutte</option>
              <option value="da_imballare">Da imballare</option>
              <option value="pronte">Pronte</option>
              <option value="spedite">Spedite</option>
              <option value="consegnate">Consegnate</option>
            </Select>
          </Field>
          <Button type="submit">Filtra</Button>
          <Link href="/spedizioni">
            <Button type="button" variant="fantasma">
              Azzera
            </Button>
          </Link>
        </form>
      </Card>

      {spedizioni.length === 0 ? (
        <EmptyState
          title="Nessuna spedizione"
          description="Le spedizioni nascono da un ordine confermato o imballato."
          action={
            puoSpedire ? (
              <Link href="/spedizioni/nuovo">
                <Button>Nuova spedizione</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Numero</Th>
                <Th>Ordine</Th>
                <Th>Cliente</Th>
                <Th>Stato</Th>
                <Th>Corriere</Th>
                <Th>Tracking</Th>
                <Th className="text-right">Colli</Th>
                <Th>Partita</Th>
              </tr>
            </thead>
            <tbody>
              {spedizioni.map((s) => {
                const situazione = statoSpedizione(s);
                return (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/spedizioni/${s.id}`} className="font-medium underline">
                        {s.number}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/vendite/${s.salesOrder.id}`} className="underline">
                        {s.salesOrder.number}
                      </Link>
                    </Td>
                    <Td>{s.salesOrder.customer.name}</Td>
                    <Td>
                      <Badge tone={situazione.tono}>{situazione.etichetta}</Badge>
                    </Td>
                    <Td>{s.carrier ?? '—'}</Td>
                    <Td>{s.trackingNumber ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{s.packagesCount}</Td>
                    <Td>{formatDateTime(s.shippedAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <p className="mt-3 flex items-center gap-3 text-sm text-fg-muted">
            <span>
              {totale} spedizioni · pagina {pagina} di {pagine}
            </span>
            {pagina > 1 && (
              <Link
                className="underline"
                href={`/spedizioni?stato=${stato}&q=${encodeURIComponent(q)}&pagina=${pagina - 1}`}
              >
                Precedente
              </Link>
            )}
            {pagina < pagine && (
              <Link
                className="underline"
                href={`/spedizioni?stato=${stato}&q=${encodeURIComponent(q)}&pagina=${pagina + 1}`}
              >
                Successiva
              </Link>
            )}
          </p>
        </>
      )}
    </>
  );
}
