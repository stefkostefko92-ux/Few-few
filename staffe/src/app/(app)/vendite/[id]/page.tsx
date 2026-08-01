import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatBp, formatCents } from '@/lib/money';
import {
  PICKLIST_STATUS_LABELS,
  PICKLIST_STATUS_TONE,
  SALES_STATUS_LABELS,
  SALES_STATUS_TONE,
  UOM_LABELS,
  formatDate,
  formatDateTime,
} from '@/lib/labels';
import { Badge, Button, Card, PageHeader, StockIndicator, Table, Td, Th } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { opzioniEditor } from '@/components/vendite/dati';
import { OrdineEditor } from '@/components/vendite/OrdineEditor';
import { AzioniOrdine } from '@/components/vendite/AzioniOrdine';
import { FormSpedizione } from '@/components/vendite/FormSpedizione';
import { STATI_MODIFICABILI, totaliOrdine } from '@/app/api/vendite/_lib';

export const metadata: Metadata = {
  title: 'Ordine di vendita',
  description: 'Dettaglio dell’ordine di vendita: righe, disponibilità, prelievi e spedizioni.',
  keywords: [
    'Carbon Stealth',
    'ordine di vendita',
    'disponibilità magazzino',
    'lista di prelievo',
    'spedizione ascensori',
    'gestionale WMS',
  ],
};

const STATI_SPEDIBILI = ['CONFERMATO', 'IN_PRELIEVO', 'IMBALLATO'];

export default async function OrdinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
  const { id } = await params;

  const ordine = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { name: true } },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true, uom: true, minStock: true } },
        },
      },
      pickLists: { orderBy: { createdAt: 'desc' } },
      shipments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!ordine) notFound();

  const giacenze = await prisma.stockItem.groupBy({
    by: ['productId'],
    where: { productId: { in: ordine.lines.map((r) => r.productId) } },
    _sum: { qty: true, reservedQty: true },
  });
  const disponibile = new Map(
    giacenze.map((g) => [g.productId, (g._sum.qty ?? 0) - (g._sum.reservedQty ?? 0)]),
  );

  const totali = totaliOrdine(ordine.lines, ordine);
  const modificabile = STATI_MODIFICABILI.includes(ordine.status);
  const puoVendere = can(utente.role, 'vendite:scrivi');
  const puoPrelevare = can(utente.role, 'prelievi:scrivi');
  const puoSpedire = can(utente.role, 'spedizioni:scrivi');

  const editor =
    modificabile && puoVendere ? await opzioniEditor() : null;

  return (
    <>
      <PageHeader
        title={`Ordine ${ordine.number}`}
        description={`${ordine.customer.code} — ${ordine.customer.name} · creato il ${formatDate(ordine.createdAt)}${
          ordine.createdBy ? ` da ${ordine.createdBy.name}` : ''
        }`}
        actions={
          <>
            <Link href={`/clienti/${ordine.customer.id}`}>
              <Button variant="fantasma">Scheda cliente</Button>
            </Link>
            <Link href="/vendite">
              <Button variant="fantasma">Torna agli ordini</Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={SALES_STATUS_TONE[ordine.status]}>{SALES_STATUS_LABELS[ordine.status]}</Badge>
        {ordine.confirmedAt && (
          <span className="text-sm text-fg-muted">
            Confermato il {formatDateTime(ordine.confirmedAt)}
          </span>
        )}
        {ordine.shippedAt && (
          <span className="text-sm text-fg-muted">Spedito il {formatDate(ordine.shippedAt)}</span>
        )}
        {ordine.deliveredAt && (
          <span className="text-sm text-fg-muted">
            Consegnato il {formatDate(ordine.deliveredAt)}
          </span>
        )}
      </div>

      <div className="mb-6">
        <AzioniOrdine
          ordineId={ordine.id}
          status={ordine.status}
          puoVendere={puoVendere}
          puoPrelevare={puoPrelevare}
        />
      </div>

      {editor ? (
        <OrdineEditor
          clienti={editor.clienti}
          prodotti={editor.prodotti}
          ordine={{
            id: ordine.id,
            customerId: ordine.customerId,
            status: ordine.status === 'PREVENTIVO' ? 'PREVENTIVO' : 'BOZZA',
            shippingCents: ordine.shippingCents,
            discountBp: ordine.discountBp,
            notes: ordine.notes,
            lines: ordine.lines.map((r) => ({
              productId: r.productId,
              qty: r.qty,
              unitPriceCents: r.unitPriceCents,
              discountBp: r.discountBp,
              vatRateBp: r.vatRateBp,
              note: r.note,
            })),
          }}
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Prodotto</Th>
                <Th className="text-right">Qtà</Th>
                <Th className="text-right">Prelevato</Th>
                <Th>Disponibilità</Th>
                <Th className="text-right">Prezzo</Th>
                <Th className="text-right">Sconto</Th>
                <Th className="text-right">IVA</Th>
                <Th className="text-right">Imponibile</Th>
              </tr>
            </thead>
            <tbody>
              {ordine.lines.map((r) => {
                const disp = disponibile.get(r.productId) ?? 0;
                const netto = totaliOrdine([r], { shippingCents: 0, discountBp: 0 }).netCents;
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/prodotti/${r.product.id}`} className="font-medium underline">
                        {r.product.sku}
                      </Link>
                      <span className="block text-xs text-fg-muted">{r.product.name}</span>
                      {r.note && <span className="block text-xs text-fg-muted">{r.note}</span>}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {r.qty} {UOM_LABELS[r.product.uom]}
                    </Td>
                    <Td className="text-right tabular-nums">{r.pickedQty}</Td>
                    <Td>
                      <StockIndicator
                        qty={disp}
                        minStock={r.product.minStock}
                        suffix={UOM_LABELS[r.product.uom]}
                      />
                      {disp < r.qty - r.pickedQty && (
                        <span className="block text-xs font-medium text-danger">
                          Disponibilità insufficiente per il residuo.
                        </span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{formatCents(r.unitPriceCents)}</Td>
                    <Td className="text-right tabular-nums">{formatBp(r.discountBp)}</Td>
                    <Td className="text-right tabular-nums">{formatBp(r.vatRateBp)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(netto)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex flex-wrap justify-end">
            <Card className="w-full max-w-sm space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Imponibile</span>
                <span className="tabular-nums">{formatCents(totali.netCents)}</span>
              </div>
              {totali.headerDiscountCents > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <span>Sconto di testata ({formatBp(ordine.discountBp)})</span>
                  <span className="tabular-nums">− {formatCents(totali.headerDiscountCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Spese di spedizione</span>
                <span className="tabular-nums">{formatCents(totali.shippingCents)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA</span>
                <span className="tabular-nums">{formatCents(totali.vatCents)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
                <span>Totale</span>
                <span className="tabular-nums">{formatCents(totali.totalCents)}</span>
              </div>
            </Card>
          </div>

          {ordine.notes && (
            <Card className="mt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Note</h2>
              <p className="mt-1 whitespace-pre-line text-sm">{ordine.notes}</p>
            </Card>
          )}
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Liste di prelievo</h2>
        {ordine.pickLists.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessuna lista di prelievo generata.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Numero</Th>
                <Th>Stato</Th>
                <Th>Creata</Th>
                <Th>Completata</Th>
              </tr>
            </thead>
            <tbody>
              {ordine.pickLists.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/prelievi/${p.id}`} className="font-medium underline">
                      {p.number}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={PICKLIST_STATUS_TONE[p.status]}>
                      {PICKLIST_STATUS_LABELS[p.status]}
                    </Badge>
                  </Td>
                  <Td>{formatDateTime(p.createdAt)}</Td>
                  <Td>{formatDateTime(p.completedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Spedizioni</h2>
        {ordine.shipments.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessuna spedizione creata.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Numero</Th>
                <Th>Corriere</Th>
                <Th>Tracking</Th>
                <Th className="text-right">Colli</Th>
                <Th>Partita</Th>
                <Th>Consegnata</Th>
              </tr>
            </thead>
            <tbody>
              {ordine.shipments.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link href={`/spedizioni/${s.id}`} className="font-medium underline">
                      {s.number}
                    </Link>
                  </Td>
                  <Td>{s.carrier ?? '—'}</Td>
                  <Td>{s.trackingNumber ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{s.packagesCount}</Td>
                  <Td>{formatDateTime(s.shippedAt)}</Td>
                  <Td>{formatDateTime(s.deliveredAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {puoSpedire && STATI_SPEDIBILI.includes(ordine.status) && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Nuova spedizione
            </h3>
            <FormSpedizione salesOrderId={ordine.id} />
          </div>
        )}
      </section>
    </>
  );
}
