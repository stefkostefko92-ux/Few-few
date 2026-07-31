import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { computeTotals, formatCents } from '@/lib/money';
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONE,
  UOM_LABELS,
  formatDate,
} from '@/lib/labels';
import { Badge, Button, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import { FornitoreForm } from '@/components/acquisti/FornitoreForm';

export const metadata: Metadata = {
  title: 'Scheda fornitore',
  description:
    'Anagrafica del fornitore, prodotti forniti, storico degli ordini e tempo di consegna realmente misurato.',
};

const GIORNO_MS = 86_400_000;

/**
 * Tempo di consegna REALE: media dei giorni fra la conferma dell'ordine e il
 * completamento del ricevimento, sugli ordini davvero chiusi.
 *
 * È il numero che conta per il riordino: quello dichiarato in anagrafica è una
 * promessa commerciale, questo è ciò che il fornitore fa. Tenerli separati è
 * l'unico modo per accorgersi di chi promette 7 giorni e ne impiega 20.
 */
function leadTimeReale(
  ordini: ReadonlyArray<{ orderedAt: Date | null; receivedAt: Date | null }>,
): { giorni: number; campione: number } | null {
  const chiusi = ordini.filter(
    (o): o is { orderedAt: Date; receivedAt: Date } =>
      o.orderedAt !== null && o.receivedAt !== null && o.receivedAt >= o.orderedAt,
  );
  if (chiusi.length === 0) return null;
  const somma = chiusi.reduce(
    (a, o) => a + (o.receivedAt.getTime() - o.orderedAt.getTime()) / GIORNO_MS,
    0,
  );
  return { giorni: Math.round(somma / chiusi.length), campione: chiusi.length };
}

export default async function SchedaFornitorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare l’anagrafica fornitori" />;

  const { id } = await params;
  const fornitore = await prisma.supplier.findUnique({
    where: { id },
    include: {
      products: {
        where: { active: true },
        select: { id: true, sku: true, name: true, uom: true, costCents: true, minStock: true },
        orderBy: { sku: 'asc' },
        take: 200,
      },
      purchaseOrders: {
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
        select: {
          id: true,
          number: true,
          status: true,
          orderedAt: true,
          receivedAt: true,
          shippingCents: true,
          lines: {
            select: {
              qty: true,
              receivedQty: true,
              unitCostCents: true,
              discountBp: true,
              vatRateBp: true,
            },
          },
        },
      },
      _count: { select: { products: true, purchaseOrders: true, goodsReceipts: true } },
    },
  });
  if (!fornitore) notFound();

  const puoScrivere = can(utente.role, 'anagrafiche:scrivi');
  const vedeCosti = can(utente.role, 'costi:leggi');

  // La media si calcola su tutti gli ordini chiusi, non solo sugli ultimi 30
  // mostrati in tabella: un campione tagliato falserebbe il dato.
  const chiusi = await prisma.purchaseOrder.findMany({
    where: { supplierId: id, status: 'RICEVUTO' },
    select: { orderedAt: true, receivedAt: true },
  });
  const reale = leadTimeReale(chiusi);

  return (
    <>
      <PageHeader
        title={`${fornitore.code} — ${fornitore.name}`}
        description={fornitore.active ? undefined : 'Fornitore disattivato'}
        actions={
          <Link href="/fornitori">
            <Button variant="secondario">Torna all’elenco</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="space-y-1 text-sm">
          <p className="font-medium">Anagrafica</p>
          <p className="text-fg-muted">P. IVA {fornitore.vatNumber ?? '—'}</p>
          <p className="text-fg-muted">C.F. {fornitore.taxCode ?? '—'}</p>
          <p className="text-fg-muted">
            {[fornitore.addressLine, fornitore.postalCode, fornitore.city, fornitore.province, fornitore.country]
              .filter(Boolean)
              .join(', ') || '—'}
          </p>
          <p className="text-fg-muted">
            {fornitore.contactName ?? '—'} · {fornitore.email ?? '—'} ·{' '}
            {fornitore.phone ?? '—'}
          </p>
          <p className="text-fg-muted">Pagamento: {fornitore.paymentTerms ?? '—'}</p>
          {!fornitore.active && <Badge tone="neutro">Disattivato</Badge>}
        </Card>

        <Card className="space-y-1 text-sm">
          <p className="font-medium">Tempi di consegna</p>
          <div className="flex justify-between">
            <span className="text-fg-muted">Dichiarato</span>
            <span className="tabular-nums">{fornitore.leadTimeDays} gg</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Reale (misurato)</span>
            <span className="tabular-nums font-medium">
              {reale ? `${reale.giorni} gg` : 'non misurabile'}
            </span>
          </div>
          <p className="text-xs text-fg-muted">
            {reale
              ? `Media su ${reale.campione} ordini completamente ricevuti.`
              : 'Serve almeno un ordine confermato e ricevuto per intero.'}
          </p>
          {reale && reale.giorni > fornitore.leadTimeDays && (
            <Badge tone="avviso">
              {reale.giorni - fornitore.leadTimeDays} gg oltre il dichiarato
            </Badge>
          )}
        </Card>

        <Card className="space-y-1 text-sm">
          <p className="font-medium">Attività</p>
          <div className="flex justify-between">
            <span className="text-fg-muted">Prodotti forniti</span>
            <span className="tabular-nums">{fornitore._count.products}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Ordini di acquisto</span>
            <span className="tabular-nums">{fornitore._count.purchaseOrders}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Ricevimenti</span>
            <span className="tabular-nums">{fornitore._count.goodsReceipts}</span>
          </div>
        </Card>
      </div>

      {fornitore.notes && (
        <Card className="mb-6 text-sm">
          <p className="mb-1 font-medium">Note</p>
          <p className="whitespace-pre-line text-fg-muted">{fornitore.notes}</p>
        </Card>
      )}

      <section className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Storico ordini</h2>
        {fornitore.purchaseOrders.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessun ordine registrato per questo fornitore.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Numero</Th>
                <Th>Stato</Th>
                <Th>Ordinato il</Th>
                <Th>Ricevuto il</Th>
                <Th className="text-right">In arrivo</Th>
                {vedeCosti && <Th className="text-right">Totale</Th>}
              </tr>
            </thead>
            <tbody>
              {fornitore.purchaseOrders.map((o) => {
                const totali = computeTotals(
                  o.lines.map((r) => ({
                    qty: r.qty,
                    unitPriceCents: r.unitCostCents,
                    discountBp: r.discountBp,
                    vatRateBp: r.vatRateBp,
                  })),
                  { shippingCents: o.shippingCents },
                );
                const inArrivo = o.lines.reduce(
                  (a, r) => a + Math.max(0, r.qty - r.receivedQty),
                  0,
                );
                return (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`/acquisti/${o.id}`} className="text-brand underline">
                        {o.number}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={PURCHASE_STATUS_TONE[o.status]}>
                        {PURCHASE_STATUS_LABELS[o.status]}
                      </Badge>
                    </Td>
                    <Td>{formatDate(o.orderedAt)}</Td>
                    <Td>{formatDate(o.receivedAt)}</Td>
                    <Td className="text-right tabular-nums">
                      {o.status === 'ANNULLATO' ? '—' : inArrivo}
                    </Td>
                    {vedeCosti && (
                      <Td className="text-right tabular-nums">
                        {formatCents(totali.totalCents)}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Prodotti forniti</h2>
        {fornitore.products.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Nessun prodotto è associato a questo fornitore in anagrafica.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Descrizione</Th>
                <Th className="text-right">Scorta minima</Th>
                {vedeCosti && <Th className="text-right">Costo</Th>}
              </tr>
            </thead>
            <tbody>
              {fornitore.products.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/prodotti/${p.id}`} className="text-brand underline">
                      {p.sku}
                    </Link>
                  </Td>
                  <Td>{p.name}</Td>
                  <Td className="text-right tabular-nums">
                    {p.minStock} {UOM_LABELS[p.uom]}
                  </Td>
                  {vedeCosti && (
                    <Td className="text-right tabular-nums">{formatCents(p.costCents)}</Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {puoScrivere && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Modifica anagrafica</h2>
          <FornitoreForm
            iniziale={{
              id: fornitore.id,
              code: fornitore.code,
              name: fornitore.name,
              vatNumber: fornitore.vatNumber,
              taxCode: fornitore.taxCode,
              email: fornitore.email,
              phone: fornitore.phone,
              contactName: fornitore.contactName,
              addressLine: fornitore.addressLine,
              city: fornitore.city,
              postalCode: fornitore.postalCode,
              province: fornitore.province,
              country: fornitore.country,
              paymentTerms: fornitore.paymentTerms,
              leadTimeDays: fornitore.leadTimeDays,
              notes: fornitore.notes,
              active: fornitore.active,
            }}
          />
        </section>
      )}
    </>
  );
}
