import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { UOM_LABELS } from '@/lib/labels';
import { PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/prodotti/comuni';
import { param, type ParametriRicerca } from '@/components/prodotti/dati';
import { FormMovimento } from '@/components/prodotti/FormMovimento';

export const metadata: Metadata = { title: 'Trasferimento' };

export default async function PaginaTrasferimento({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'giacenze:muovi')) {
    return <AccessoNegato cosa="i trasferimenti di merce" />;
  }

  const sp = await searchParams;

  const [prodotti, ubicazioni, righe] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, uom: true, batchTracked: true },
      orderBy: { sku: 'asc' },
    }),
    prisma.location.findMany({
      where: { active: true },
      select: { id: true, code: true },
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.stockItem.findMany({
      where: { qty: { gt: 0 } },
      select: {
        productId: true,
        locationId: true,
        batchId: true,
        qty: true,
        reservedQty: true,
        batch: { select: { code: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Trasferimento fra ubicazioni"
        description="Sposta merce da un vano all’altro. La quantità totale in magazzino non cambia: cambia dove si trova."
      />
      <FormMovimento
        modo="trasferimento"
        prodotti={prodotti.map((p) => ({ ...p, uom: UOM_LABELS[p.uom] }))}
        ubicazioni={ubicazioni}
        giacenze={righe.map((r) => ({
          productId: r.productId,
          locationId: r.locationId,
          batchId: r.batchId,
          batchCode: r.batch?.code ?? null,
          qty: r.qty,
          reservedQty: r.reservedQty,
        }))}
        prodottoIniziale={param(sp, 'prodottoId')}
        ubicazioneIniziale={param(sp, 'ubicazioneId')}
      />
    </>
  );
}
