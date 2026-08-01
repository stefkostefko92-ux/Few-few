import type { Metadata } from 'next';
import Link from 'next/link';
import type { PickListStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { PICKLIST_STATUS_LABELS, PICKLIST_STATUS_TONE, formatDateTime } from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';

export const metadata: Metadata = {
  title: 'Prelievo e imballaggio',
  description:
    'Liste di prelievo ordinate per percorso di magazzino, con verifica tramite scansione del codice a barre.',
  keywords: [
    'Carbon Stealth',
    'lista di prelievo',
    'percorso di magazzino',
    'scansione codice a barre',
    'imballaggio e documento di trasporto',
    'WMS ascensori',
  ],
};

const PER_PAGINA = 25;

function isStatoPrelievo(v: string | null): v is PickListStatus {
  return v !== null && ['APERTA', 'IN_CORSO', 'COMPLETATA', 'ANNULLATA'].includes(v);
}

export default async function PrelieviPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await utenteConPermesso('prelievi:leggi');
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const stato = uno(sp.stato);
  const pagina = Math.max(1, Number.parseInt(uno(sp.pagina) || '1', 10) || 1);
  const filtro = stato || null;

  const where: Prisma.PickListWhereInput = isStatoPrelievo(filtro) ? { status: filtro } : {};

  const [liste, totale] = await Promise.all([
    prisma.pickList.findMany({
      where,
      include: {
        salesOrder: {
          select: { id: true, number: true, customer: { select: { name: true } } },
        },
        assignedTo: { select: { name: true } },
        lines: { select: { qty: true, pickedQty: true, verified: true } },
      },
      // Prima le liste da fare: chi è in magazzino apre questa pagina per
      // sapere cosa prelevare adesso, non per consultare lo storico.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.pickList.count({ where }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));

  return (
    <>
      <PageHeader
        title="Prelievo e imballaggio"
        description="Le righe seguono l’ordine di percorrenza del magazzino: un solo giro, nessun ritorno."
      />

      <Card className="mb-4 no-print">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Stato" htmlFor="f-stato">
            <Select id="f-stato" name="stato" defaultValue={stato}>
              <option value="">Tutte</option>
              {Object.entries(PICKLIST_STATUS_LABELS).map(([valore, etichetta]) => (
                <option key={valore} value={valore}>
                  {etichetta}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Filtra</Button>
          <Link href="/prelievi">
            <Button type="button" variant="fantasma">
              Azzera
            </Button>
          </Link>
        </form>
      </Card>

      {liste.length === 0 ? (
        <EmptyState
          title="Nessuna lista di prelievo"
          description="Le liste si generano dal dettaglio di un ordine confermato."
          action={
            <Link href="/vendite?stato=CONFERMATO">
              <Button>Ordini confermati</Button>
            </Link>
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
                <Th className="text-right">Avanzamento</Th>
                <Th>Assegnata a</Th>
                <Th>Creata</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => {
                const fatte = l.lines.filter((r) => r.pickedQty > 0).length;
                const senzaScansione = l.lines.filter(
                  (r) => r.pickedQty > 0 && !r.verified,
                ).length;
                return (
                  <tr key={l.id}>
                    <Td>
                      <Link href={`/prelievi/${l.id}`} className="font-medium underline">
                        {l.number}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/vendite/${l.salesOrder.id}`} className="underline">
                        {l.salesOrder.number}
                      </Link>
                    </Td>
                    <Td>{l.salesOrder.customer.name}</Td>
                    <Td>
                      <Badge tone={PICKLIST_STATUS_TONE[l.status]}>
                        {PICKLIST_STATUS_LABELS[l.status]}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {fatte} / {l.lines.length}
                      {senzaScansione > 0 && (
                        <span className="block text-xs text-warn">
                          {senzaScansione} senza scansione
                        </span>
                      )}
                    </Td>
                    <Td>{l.assignedTo?.name ?? '—'}</Td>
                    <Td>{formatDateTime(l.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <p className="mt-3 flex items-center gap-3 text-sm text-fg-muted">
            <span>
              {totale} liste · pagina {pagina} di {pagine}
            </span>
            {pagina > 1 && (
              <Link className="underline" href={`/prelievi?stato=${stato}&pagina=${pagina - 1}`}>
                Precedente
              </Link>
            )}
            {pagina < pagine && (
              <Link className="underline" href={`/prelievi?stato=${stato}&pagina=${pagina + 1}`}>
                Successiva
              </Link>
            )}
          </p>
        </>
      )}
    </>
  );
}
