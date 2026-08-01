import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { PICKLIST_STATUS_LABELS, PICKLIST_STATUS_TONE, formatDateTime } from '@/lib/labels';
import { Badge, Button, PageHeader } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { PrelievoWorkbench } from '@/components/vendite/PrelievoWorkbench';

export const metadata: Metadata = {
  title: 'Lista di prelievo',
  description:
    'Schermo di lavoro del magazziniere: percorso ottimizzato, scansione del codice a barre e chiusura del prelievo.',
  keywords: [
    'Carbon Stealth',
    'lista di prelievo',
    'scansione codice a barre',
    'percorso ottimizzato magazzino',
    'imballaggio ordini',
    'staffe per ascensori',
  ],
};

export default async function PrelievoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('prelievi:leggi');
  const { id } = await params;

  const lista = await prisma.pickList.findUnique({
    where: { id },
    include: {
      salesOrder: {
        select: {
          id: true,
          number: true,
          customer: { select: { id: true, name: true } },
        },
      },
      assignedTo: { select: { name: true } },
      lines: {
        orderBy: { sortIndex: 'asc' },
        include: {
          product: { select: { id: true, sku: true, barcode: true, name: true, uom: true } },
          location: { select: { code: true, zone: true, aisle: true } },
        },
      },
    },
  });
  if (!lista) notFound();

  return (
    <>
      <PageHeader
        title={`Prelievo ${lista.number}`}
        description={`Ordine ${lista.salesOrder.number} — ${lista.salesOrder.customer.name}${
          lista.assignedTo ? ` · assegnata a ${lista.assignedTo.name}` : ''
        }`}
        actions={
          <>
            <Link href={`/prelievi/${lista.id}/imballaggio`}>
              <Button variant="secondario">Documento di trasporto</Button>
            </Link>
            <Link href={`/vendite/${lista.salesOrder.id}`}>
              <Button variant="fantasma">Apri l’ordine</Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={PICKLIST_STATUS_TONE[lista.status]}>
          {PICKLIST_STATUS_LABELS[lista.status]}
        </Badge>
        {lista.startedAt && (
          <span className="text-sm text-fg-muted">Iniziata {formatDateTime(lista.startedAt)}</span>
        )}
        {lista.completedAt && (
          <span className="text-sm text-fg-muted">
            Completata {formatDateTime(lista.completedAt)}
          </span>
        )}
      </div>

      <PrelievoWorkbench
        prelievoId={lista.id}
        stato={lista.status}
        puoScrivere={can(utente.role, 'prelievi:scrivi')}
        righe={lista.lines.map((r) => ({
          id: r.id,
          sortIndex: r.sortIndex,
          qty: r.qty,
          pickedQty: r.pickedQty,
          verified: r.verified,
          product: r.product,
          location: r.location,
        }))}
      />
    </>
  );
}
