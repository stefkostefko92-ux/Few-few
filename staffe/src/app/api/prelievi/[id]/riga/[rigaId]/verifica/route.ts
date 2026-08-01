import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { testoONull, verificaRigaSchema } from '@/lib/validation/vendite';

type Contesto = { params: Promise<{ id: string; rigaId: string }> };

/**
 * Verifica di una riga di prelievo.
 *
 * `verified` diventa vero **solo** dopo una scansione che corrisponde al
 * prodotto: è ciò che distingue un prelievo controllato da una spunta a
 * memoria. Chi non può scansionare deve dichiarare il motivo, che resta nella
 * traccia di controllo — la riga non si chiude mai in silenzio.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('prelievi:scrivi');
  const { id, rigaId } = await params;
  const dati = await readBody(request, verificaRigaSchema);

  const riga = await prisma.pickListLine.findFirst({
    where: { id: rigaId, pickListId: id },
    include: {
      pickList: { select: { id: true, number: true, status: true, startedAt: true } },
      product: { select: { id: true, sku: true, barcode: true, name: true } },
      location: { select: { code: true } },
    },
  });
  if (!riga) return fail(404, 'Riga di prelievo non trovata.', 'non_trovato');
  if (riga.pickList.status !== 'APERTA' && riga.pickList.status !== 'IN_CORSO') {
    return fail(409, 'La lista di prelievo non è più aperta.', 'stato');
  }

  const scansione = testoONull(dati.barcode);
  const motivo = testoONull(dati.motivo);

  let verificata = false;
  if (scansione) {
    const atteso = [riga.product.barcode, riga.product.sku]
      .filter((v): v is string => !!v)
      .map((v) => v.toLowerCase());
    if (!atteso.includes(scansione.toLowerCase())) {
      return fail(
        422,
        `Codice scansionato non corrispondente: questa riga richiede ${riga.product.sku}.`,
        'codice_non_corrispondente',
      );
    }
    verificata = true;
  }

  // Non si preleva più di quanto la lista chiede: l'eccedenza sarebbe merce
  // uscita senza documento che la spieghi.
  const richiesta = dati.pickedQty ?? riga.qty;
  const prelevata = Math.min(Math.max(0, richiesta), riga.qty);

  const aggiornata = await prisma.$transaction(async (tx) => {
    if (riga.pickList.status === 'APERTA') {
      await tx.pickList.update({
        where: { id: riga.pickList.id },
        data: { status: 'IN_CORSO', startedAt: riga.pickList.startedAt ?? new Date() },
      });
    }
    return tx.pickListLine.update({
      where: { id: riga.id },
      data: { pickedQty: prelevata, verified: verificata },
    });
  });

  await audit({
    userId: utente.id,
    action: verificata ? 'VERIFICA_SCANSIONE' : 'VERIFICA_MANUALE',
    entity: 'PickListLine',
    entityId: riga.id,
    summary: verificata
      ? `${riga.pickList.number}: ${riga.product.sku} confermato con scansione in ${riga.location.code} (${prelevata} pz).`
      : `${riga.pickList.number}: ${riga.product.sku} confermato SENZA scansione in ${riga.location.code} (${prelevata} pz).`,
    changes: { pickedQty: prelevata, verified: verificata, motivo },
  });

  return ok({
    id: aggiornata.id,
    pickedQty: aggiornata.pickedQty,
    verified: aggiornata.verified,
  });
});
