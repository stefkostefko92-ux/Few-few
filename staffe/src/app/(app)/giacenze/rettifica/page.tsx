import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { UOM_LABELS } from '@/lib/labels';
import { Card, PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/prodotti/comuni';
import { param, type ParametriRicerca } from '@/components/prodotti/dati';
import { FormMovimento } from '@/components/prodotti/FormMovimento';

export const metadata: Metadata = { title: 'Rettifica giacenza' };

export default async function PaginaRettifica({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const user = await getSessionUser();
  // Permesso più stretto del modulo: il commerciale non rettifica le giacenze.
  if (!user || !can(user.role, 'giacenze:rettifica')) {
    return <AccessoNegato cosa="la rettifica manuale delle giacenze" />;
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
        title="Rettifica giacenza"
        description="Correzione manuale della quantità presente in un’ubicazione."
      />

      <Card className="mb-4 border-warn/40 bg-warn/10">
        <p className="text-sm">
          La rettifica cambia la giacenza senza un documento a monte: usala solo
          per allineare il sistema alla realtà del magazzino (merce danneggiata,
          errore di conteggio, ritrovamento). Resta registrata a tuo nome nel
          registro dei movimenti, con il motivo che scrivi qui sotto.
        </p>
      </Card>

      <FormMovimento
        modo="rettifica"
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
