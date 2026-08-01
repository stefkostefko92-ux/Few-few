import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatCents } from '@/lib/money';
import { UOM_LABELS, formatDate, formatDateTime } from '@/lib/labels';
import { Button, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';

export const metadata: Metadata = {
  title: 'Ricevimento merce',
  description: 'Dettaglio del documento di ricevimento e dei movimenti di giacenza generati.',
};

export default async function DettaglioRicevimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare i ricevimenti" />;

  const { id } = await params;
  const ricevimento = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true, status: true } },
      user: { select: { name: true } },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true, uom: true } },
          location: { select: { id: true, code: true } },
          batch: { select: { code: true, expiresAt: true } },
        },
      },
    },
  });
  if (!ricevimento) notFound();

  const vedeCosti = can(utente.role, 'costi:leggi');
  const pezzi = ricevimento.lines.reduce((a, l) => a + l.qty, 0);
  const valore = ricevimento.lines.reduce((a, l) => a + l.qty * l.unitCostCents, 0);

  // I movimenti generati da questo documento: la prova che la giacenza e il
  // documento raccontano la stessa storia.
  const movimenti = await prisma.stockMovement.findMany({
    where: { refType: 'GoodsReceipt', refId: ricevimento.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      qty: true,
      createdAt: true,
      product: { select: { sku: true } },
      toLocation: { select: { code: true } },
    },
  });

  return (
    <>
      <PageHeader
        title={`Ricevimento ${ricevimento.number}`}
        description={`${ricevimento.supplier.code} — ${ricevimento.supplier.name}`}
        actions={
          <Link href="/ricevimenti">
            <Button variant="secondario">Torna all’elenco</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Data di arrivo</span>
            <span>{formatDateTime(ricevimento.receivedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Fattura / DDT</span>
            <span>{ricevimento.invoiceNumber ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Ordine di acquisto</span>
            <span>
              {ricevimento.purchaseOrder ? (
                <Link
                  href={`/acquisti/${ricevimento.purchaseOrder.id}`}
                  className="text-brand underline"
                >
                  {ricevimento.purchaseOrder.number}
                </Link>
              ) : (
                'senza ordine'
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Registrato da</span>
            <span>{ricevimento.user?.name ?? '—'}</span>
          </div>
        </Card>

        <Card className="space-y-1 text-sm">
          <p className="font-medium">{ricevimento.supplier.name}</p>
          <p className="text-fg-muted">
            P. IVA {ricevimento.supplier.vatNumber ?? '—'}
          </p>
          <p className="text-fg-muted">
            {ricevimento.supplier.email ?? '—'} · {ricevimento.supplier.phone ?? '—'}
          </p>
          <Link href={`/fornitori/${ricevimento.supplierId}`} className="text-brand underline">
            Scheda fornitore
          </Link>
        </Card>

        <Card className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Righe</span>
            <span className="tabular-nums">{ricevimento.lines.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Pezzi entrati</span>
            <span className="tabular-nums font-medium">{pezzi}</span>
          </div>
          {vedeCosti && (
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Valore della merce</span>
              <span className="tabular-nums">{formatCents(valore)}</span>
            </div>
          )}
        </Card>
      </div>

      {ricevimento.notes && (
        <Card className="mb-6 text-sm">
          <p className="mb-1 font-medium">Note</p>
          <p className="whitespace-pre-line text-fg-muted">{ricevimento.notes}</p>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Righe ricevute</h2>
        <Table>
          <thead>
            <tr>
              <Th>Prodotto</Th>
              <Th className="text-right">Quantità</Th>
              <Th>Ubicazione</Th>
              <Th>Lotto</Th>
              {vedeCosti && <Th className="text-right">Costo unit.</Th>}
              {vedeCosti && <Th className="text-right">Valore</Th>}
            </tr>
          </thead>
          <tbody>
            {ricevimento.lines.map((l) => (
              <tr key={l.id}>
                <Td>
                  <Link href={`/prodotti/${l.productId}`} className="text-brand underline">
                    {l.product.sku}
                  </Link>{' '}
                  — {l.product.name}
                  {l.note && <span className="block text-xs text-fg-muted">{l.note}</span>}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.qty} {UOM_LABELS[l.product.uom]}
                </Td>
                <Td>
                  <Link href={`/ubicazioni/${l.locationId}`} className="text-brand underline">
                    {l.location.code}
                  </Link>
                </Td>
                <Td>
                  {l.batch ? (
                    <>
                      {l.batch.code}
                      {l.batch.expiresAt && (
                        <span className="block text-xs text-fg-muted">
                          scade il {formatDate(l.batch.expiresAt)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </Td>
                {vedeCosti && (
                  <Td className="text-right tabular-nums">{formatCents(l.unitCostCents)}</Td>
                )}
                {vedeCosti && (
                  <Td className="text-right tabular-nums">
                    {formatCents(l.qty * l.unitCostCents)}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Movimenti di giacenza generati</h2>
        {movimenti.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessun movimento collegato.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Prodotto</Th>
                <Th className="text-right">Quantità</Th>
                <Th>Destinazione</Th>
                <Th>Registrato</Th>
              </tr>
            </thead>
            <tbody>
              {movimenti.map((m) => (
                <tr key={m.id}>
                  <Td>{m.product.sku}</Td>
                  <Td className="text-right tabular-nums">+{m.qty}</Td>
                  <Td>{m.toLocation?.code ?? '—'}</Td>
                  <Td>{formatDateTime(m.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
