import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { selectRigaRicevimento } from '@/lib/costi';
import { fail, ok, route } from '@/lib/api';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Dettaglio del ricevimento. Il documento non si modifica e non si cancella:
 * ha già generato movimenti di giacenza. Una correzione si registra con un
 * movimento contrario (reso a fornitore o rettifica), non riscrivendo la storia.
 */
export const GET = route(async (_request: Request, { params }: Contesto) => {
  const utente = await requirePermission('acquisti:leggi');
  const { id } = await params;

  const ricevimento = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true, status: true } },
      user: { select: { id: true, name: true } },
      lines: {
        select: {
          ...selectRigaRicevimento(utente.role),
          product: { select: { id: true, sku: true, name: true, uom: true } },
          location: { select: { id: true, code: true } },
          batch: { select: { id: true, code: true, expiresAt: true } },
        },
      },
    },
  });
  if (!ricevimento) return fail(404, 'Ricevimento non trovato.', 'non_trovato');

  return ok(ricevimento);
});
