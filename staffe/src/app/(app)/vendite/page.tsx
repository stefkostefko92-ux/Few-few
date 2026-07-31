import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatCents } from '@/lib/money';
import { SALES_STATUS_LABELS, SALES_STATUS_TONE, formatDate } from '@/lib/labels';
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
import { isStatoVendita, periodoWhere, totaliOrdine } from '@/app/api/vendite/_lib';

export const metadata: Metadata = {
  title: 'Ordini di vendita',
  description:
    'Ordini di vendita e preventivi: stato, cliente, periodo e totali calcolati sul server.',
  keywords: [
    'Carbon Stealth',
    'ordini di vendita',
    'preventivi staffe ascensore',
    'gestionale magazzino',
    'prelievo e spedizione',
    'WMS italiano',
  ],
};

const PER_PAGINA = 25;

export default async function VenditePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const stato = uno(sp.stato);
  const cliente = uno(sp.cliente);
  const q = uno(sp.q).trim();
  const da = uno(sp.da);
  const a = uno(sp.a);
  const pagina = Math.max(1, Number.parseInt(uno(sp.pagina) || '1', 10) || 1);
  const statoFiltro = stato || null;

  /** Conserva i filtri correnti quando si cambia pagina. */
  function link(nuovaPagina: number): string {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (stato) p.set('stato', stato);
    if (cliente) p.set('cliente', cliente);
    if (da) p.set('da', da);
    if (a) p.set('a', a);
    p.set('pagina', String(nuovaPagina));
    return `/vendite?${p.toString()}`;
  }

  const where: Prisma.SalesOrderWhereInput = {
    ...(isStatoVendita(statoFiltro) ? { status: statoFiltro } : {}),
    ...(cliente ? { customerId: cliente } : {}),
    ...(periodoWhere(da || null, a || null) ?? {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [ordini, totale, clienti] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        lines: {
          select: { qty: true, unitPriceCents: true, discountBp: true, vatRateBp: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.salesOrder.count({ where }),
    prisma.customer.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const puoScrivere = can(utente.role, 'vendite:scrivi');

  return (
    <>
      <PageHeader
        title="Ordini di vendita"
        description="Preventivi e ordini: dalla trattativa alla consegna."
        actions={
          puoScrivere ? (
            <Link href="/vendite/nuovo">
              <Button>Nuovo ordine</Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Cerca" htmlFor="f-q" hint="Numero documento o cliente.">
            <Input id="f-q" name="q" defaultValue={q} type="search" />
          </Field>
          <Field label="Stato" htmlFor="f-stato">
            <Select id="f-stato" name="stato" defaultValue={stato}>
              <option value="">Tutti</option>
              {Object.entries(SALES_STATUS_LABELS).map(([valore, etichetta]) => (
                <option key={valore} value={valore}>
                  {etichetta}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente" htmlFor="f-cliente">
            <Select id="f-cliente" name="cliente" defaultValue={cliente}>
              <option value="">Tutti</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dal" htmlFor="f-da">
            <Input id="f-da" name="da" type="date" defaultValue={da} />
          </Field>
          <Field label="Al" htmlFor="f-a">
            <Input id="f-a" name="a" type="date" defaultValue={a} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">Filtra</Button>
            <Link href="/vendite">
              <Button type="button" variant="fantasma">
                Azzera
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {ordini.length === 0 ? (
        <EmptyState
          title="Nessun ordine di vendita"
          description="Cambiare i filtri oppure creare il primo ordine."
          action={
            puoScrivere ? (
              <Link href="/vendite/nuovo">
                <Button>Nuovo ordine</Button>
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
                <Th>Cliente</Th>
                <Th>Stato</Th>
                <Th>Data</Th>
                <Th className="text-right">Righe</Th>
                <Th className="text-right">Imponibile</Th>
                <Th className="text-right">Totale</Th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => {
                const totali = totaliOrdine(o.lines, o);
                return (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`/vendite/${o.id}`} className="font-medium underline">
                        {o.number}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/clienti/${o.customer.id}`} className="underline">
                        {o.customer.name}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={SALES_STATUS_TONE[o.status]}>
                        {SALES_STATUS_LABELS[o.status]}
                      </Badge>
                    </Td>
                    <Td>{formatDate(o.orderedAt ?? o.createdAt)}</Td>
                    <Td className="text-right tabular-nums">{o.lines.length}</Td>
                    <Td className="text-right tabular-nums">{formatCents(totali.netCents)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatCents(totali.totalCents)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <p className="mt-3 flex items-center gap-3 text-sm text-fg-muted">
            <span>
              {totale} ordini · pagina {pagina} di {pagine}
            </span>
            {pagina > 1 && (
              <Link className="underline" href={link(pagina - 1)}>
                Precedente
              </Link>
            )}
            {pagina < pagine && (
              <Link className="underline" href={link(pagina + 1)}>
                Successiva
              </Link>
            )}
          </p>
        </>
      )}
    </>
  );
}
