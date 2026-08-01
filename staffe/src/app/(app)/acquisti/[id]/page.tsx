import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { computeTotals, formatCents, formatBp } from '@/lib/money';
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONE,
  UOM_LABELS,
  formatDate,
  formatDateTime,
} from '@/lib/labels';
import { Badge, Button, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import { AzioniOrdine } from '@/components/acquisti/AzioniOrdine';
import { OrdineAcquistoForm } from '@/components/acquisti/OrdineAcquistoForm';

export const metadata: Metadata = {
  title: 'Ordine di acquisto',
  description: 'Dettaglio dell’ordine di acquisto, righe, merce in arrivo e ricevimenti collegati.',
};

const MAX_PRODOTTI = 1000;

function inIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function DettaglioOrdinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare gli ordini di acquisto" />;

  const { id } = await params;
  const ordine = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      lines: {
        include: { product: { select: { id: true, sku: true, name: true, uom: true } } },
      },
      receipts: {
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          number: true,
          receivedAt: true,
          invoiceNumber: true,
          _count: { select: { lines: true } },
        },
      },
    },
  });
  if (!ordine) notFound();

  const puoScrivere = can(utente.role, 'acquisti:scrivi');
  const puoRicevere = can(utente.role, 'ricevimenti:scrivi');
  // Il magazziniere lavora sulle quantità, non sui costi: la marginalità non è
  // affar suo e resta fuori dalla pagina (invariante di prodotto).
  const vedeCosti = can(utente.role, 'costi:leggi');
  const inBozza = ordine.status === 'BOZZA';

  const totali = computeTotals(
    ordine.lines.map((r) => ({
      qty: r.qty,
      unitPriceCents: r.unitCostCents,
      discountBp: r.discountBp,
      vatRateBp: r.vatRateBp,
    })),
    { shippingCents: ordine.shippingCents },
  );
  const inArrivo = ordine.lines.reduce((a, r) => a + Math.max(0, r.qty - r.receivedQty), 0);

  const [fornitori, prodotti] =
    inBozza && puoScrivere
      ? await Promise.all([
          prisma.supplier.findMany({
            where: { OR: [{ active: true }, { id: ordine.supplierId }] },
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
          }),
          prisma.product.findMany({
            where: { active: true },
            select: { id: true, sku: true, name: true, uom: true, costCents: true, vatRateBp: true },
            orderBy: { sku: 'asc' },
            take: MAX_PRODOTTI,
          }),
        ])
      : [[], []];

  return (
    <>
      <PageHeader
        title={`Ordine ${ordine.number}`}
        description={`${ordine.supplier.code} — ${ordine.supplier.name}`}
        actions={
          <>
            <Link href="/acquisti">
              <Button variant="secondario">Torna all’elenco</Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Stato</span>
            <Badge tone={PURCHASE_STATUS_TONE[ordine.status]}>
              {PURCHASE_STATUS_LABELS[ordine.status]}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Ordinato il</span>
            <span>{formatDate(ordine.orderedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Consegna prevista</span>
            <span>{formatDate(ordine.expectedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Ricevuto il</span>
            <span>{formatDate(ordine.receivedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Creato da</span>
            <span>{ordine.createdBy?.name ?? '—'}</span>
          </div>
        </Card>

        <Card className="space-y-1 text-sm">
          <p className="font-medium">{ordine.supplier.name}</p>
          <p className="text-fg-muted">
            {[ordine.supplier.addressLine, ordine.supplier.postalCode, ordine.supplier.city, ordine.supplier.province]
              .filter(Boolean)
              .join(', ') || '—'}
          </p>
          <p className="text-fg-muted">
            P. IVA {ordine.supplier.vatNumber ?? '—'} · consegna dichiarata{' '}
            {ordine.supplier.leadTimeDays} gg
          </p>
          <p className="text-fg-muted">
            {ordine.supplier.email ?? '—'} · {ordine.supplier.phone ?? '—'}
          </p>
          <Link href={`/fornitori/${ordine.supplierId}`} className="text-brand underline">
            Scheda fornitore
          </Link>
        </Card>

        <Card className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Pezzi ancora in arrivo</span>
            <span className="tabular-nums font-medium">
              {ordine.status === 'ANNULLATO' ? '—' : inArrivo}
            </span>
          </div>
          {vedeCosti && (
            <>
              <div className="flex justify-between">
                <span className="text-fg-muted">Imponibile</span>
                <span className="tabular-nums">{formatCents(totali.netCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Spedizione</span>
                <span className="tabular-nums">{formatCents(totali.shippingCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">IVA</span>
                <span className="tabular-nums">{formatCents(totali.vatCents)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Totale</span>
                <span className="tabular-nums">{formatCents(totali.totalCents)}</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {(puoScrivere || puoRicevere) && (
        <div className="mb-6">
          <AzioniOrdine
            id={ordine.id}
            stato={ordine.status}
            puoScrivere={puoScrivere}
            puoRicevere={puoRicevere}
          />
        </div>
      )}

      {ordine.notes && (
        <Card className="mb-6 text-sm">
          <p className="mb-1 font-medium">Note</p>
          <p className="whitespace-pre-line text-fg-muted">{ordine.notes}</p>
        </Card>
      )}

      {inBozza && puoScrivere ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Modifica della bozza</h2>
          <p className="text-sm text-fg-muted">
            Dopo la conferma le righe si congelano: sono il metro con cui si
            controlla la merce in arrivo.
          </p>
          <OrdineAcquistoForm
            fornitori={fornitori}
            prodotti={prodotti}
            iniziale={{
              id: ordine.id,
              numero: ordine.number,
              supplierId: ordine.supplierId,
              expectedAt: inIso(ordine.expectedAt),
              shippingCents: ordine.shippingCents,
              notes: ordine.notes,
              righe: ordine.lines.map((r) => ({
                productId: r.productId,
                qty: r.qty,
                unitCostCents: r.unitCostCents,
                discountBp: r.discountBp,
                vatRateBp: r.vatRateBp,
                note: r.note,
              })),
            }}
          />
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Righe dell’ordine</h2>
          <Table>
            <thead>
              <tr>
                <Th>Prodotto</Th>
                <Th className="text-right">Ordinato</Th>
                <Th className="text-right">Ricevuto</Th>
                <Th className="text-right">In arrivo</Th>
                {vedeCosti && <Th className="text-right">Costo unit.</Th>}
                {vedeCosti && <Th className="text-right">Sconto</Th>}
                {vedeCosti && <Th className="text-right">IVA</Th>}
                {vedeCosti && <Th className="text-right">Imponibile</Th>}
              </tr>
            </thead>
            <tbody>
              {ordine.lines.map((r) => {
                const residuo = Math.max(0, r.qty - r.receivedQty);
                const imponibile = computeTotals([
                  {
                    qty: r.qty,
                    unitPriceCents: r.unitCostCents,
                    discountBp: r.discountBp,
                    vatRateBp: r.vatRateBp,
                  },
                ]).netCents;
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/prodotti/${r.productId}`} className="text-brand underline">
                        {r.product.sku}
                      </Link>{' '}
                      — {r.product.name}
                      {r.note && (
                        <span className="block text-xs text-fg-muted">{r.note}</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {r.qty} {UOM_LABELS[r.product.uom]}
                    </Td>
                    <Td className="text-right tabular-nums">{r.receivedQty}</Td>
                    <Td className="text-right tabular-nums">
                      {residuo > 0 ? (
                        <Badge tone={r.receivedQty > 0 ? 'avviso' : 'corso'}>{residuo}</Badge>
                      ) : (
                        <Badge tone="ok">0</Badge>
                      )}
                    </Td>
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">
                        {formatCents(r.unitCostCents)}
                      </Td>
                    )}
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">{formatBp(r.discountBp)}</Td>
                    )}
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">{formatBp(r.vatRateBp)}</Td>
                    )}
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">{formatCents(imponibile)}</Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Ricevimenti collegati</h2>
        {ordine.receipts.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessuna merce ancora ricevuta per questo ordine.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Documento</Th>
                <Th>Data</Th>
                <Th>Fattura / DDT</Th>
                <Th className="text-right">Righe</Th>
              </tr>
            </thead>
            <tbody>
              {ordine.receipts.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/ricevimenti/${r.id}`} className="text-brand underline">
                      {r.number}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(r.receivedAt)}</Td>
                  <Td>{r.invoiceNumber ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{r._count.lines}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
