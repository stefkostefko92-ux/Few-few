import type { Metadata } from 'next';
import Link from 'next/link';
import { PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { computeTotals, formatCents } from '@/lib/money';
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONE,
  formatDate,
} from '@/lib/labels';
import { whereOrdiniAcquisto } from '@/lib/validation/acquisti';
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
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import {
  Paginazione,
  primo,
  type ParametriRicerca,
} from '@/components/acquisti/elenco';

export const metadata: Metadata = {
  title: 'Ordini di acquisto',
  description:
    'Elenco degli ordini di acquisto: stato, fornitore, periodo, merce ancora in arrivo.',
};

const PER_PAGINA = 25;

export default async function ElencoAcquistiPage({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const utente = await utenteConPermesso('acquisti:leggi');
  if (!utente) return <Vietato azione="consultare gli ordini di acquisto" />;

  const sp = await searchParams;
  const filtri = {
    stato: primo(sp, 'stato'),
    fornitore: primo(sp, 'fornitore'),
    dal: primo(sp, 'dal'),
    al: primo(sp, 'al'),
    q: primo(sp, 'q'),
  };
  const pagina = Math.max(1, Number(primo(sp, 'page')) || 1);
  const where = whereOrdiniAcquisto(filtri);

  const [ordini, totale, fornitori] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
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
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  // Invariante di prodotto: il magazziniere non vede costi né marginalità.
  const vedeCosti = can(utente.role, 'costi:leggi');

  return (
    <>
      <PageHeader
        title="Ordini di acquisto"
        description="Ciclo bozza → ordinato → ricevuto. La colonna „In arrivo“ è la merce ordinata e non ancora entrata."
        actions={
          <Link href="/acquisti/nuovo">
            <Button>Nuovo ordine</Button>
          </Link>
        }
      />

      <Card className="mb-4 no-print">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Stato" htmlFor="f-stato">
            <Select id="f-stato" name="stato" defaultValue={filtri.stato}>
              <option value="">Tutti</option>
              {Object.values(PurchaseOrderStatus).map((s) => (
                <option key={s} value={s}>
                  {PURCHASE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fornitore" htmlFor="f-fornitore">
            <Select id="f-fornitore" name="fornitore" defaultValue={filtri.fornitore}>
              <option value="">Tutti</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dal" htmlFor="f-dal">
            <Input id="f-dal" type="date" name="dal" defaultValue={filtri.dal} />
          </Field>
          <Field label="Al" htmlFor="f-al">
            <Input id="f-al" type="date" name="al" defaultValue={filtri.al} />
          </Field>
          <Field label="Cerca" htmlFor="f-q" hint="Numero ordine o fornitore">
            <Input id="f-q" name="q" type="search" defaultValue={filtri.q} />
          </Field>
          <div className="flex items-end gap-2 lg:col-span-5">
            <Button type="submit">Filtra</Button>
            <Link href="/acquisti">
              <Button type="button" variant="fantasma">
                Azzera
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {ordini.length === 0 ? (
        <EmptyState
          title="Nessun ordine di acquisto"
          description="Nessun ordine corrisponde ai filtri impostati."
          action={
            <Link href="/acquisti/nuovo">
              <Button>Nuovo ordine</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Numero</Th>
              <Th>Fornitore</Th>
              <Th>Stato</Th>
              <Th>Ordinato il</Th>
              <Th>Previsto</Th>
              <Th className="text-right">Righe</Th>
              <Th className="text-right">In arrivo</Th>
              {vedeCosti && <Th className="text-right">Totale</Th>}
            </tr>
          </thead>
          <tbody>
            {ordini.map((o) => {
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
                    <Link href={`/acquisti/${o.id}`} className="font-medium text-brand underline">
                      {o.number}
                    </Link>
                  </Td>
                  <Td>{o.supplier.name}</Td>
                  <Td>
                    <Badge tone={PURCHASE_STATUS_TONE[o.status]}>
                      {PURCHASE_STATUS_LABELS[o.status]}
                    </Badge>
                  </Td>
                  <Td>{formatDate(o.orderedAt)}</Td>
                  <Td>{formatDate(o.expectedAt)}</Td>
                  <Td className="text-right tabular-nums">{o.lines.length}</Td>
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

      <Paginazione
        base="/acquisti"
        filtri={filtri}
        pagina={pagina}
        pagine={pagine}
        totale={totale}
      />
    </>
  );
}
