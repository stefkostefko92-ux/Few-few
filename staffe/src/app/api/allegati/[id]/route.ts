import { NextResponse } from 'next/server';
import { requirePermission, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, route } from '@/lib/api';
import {
  UploadError,
  eliminaAllegato,
  intestazioniDownload,
  leggiAllegato,
  permessiAllegato,
} from '@/lib/uploads';

type Contesto = { params: Promise<{ id: string }> };

const RIFERIMENTI = {
  id: true,
  kind: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  storageKey: true,
  productId: true,
  purchaseOrderId: true,
  salesOrderId: true,
  goodsReceiptId: true,
} as const;

/**
 * Scarica l'allegato. Il file NON è servito da `public/`: passa da qui proprio
 * per poter controllare i permessi del documento collegato prima di aprire il
 * disco. Esce sempre come allegato, con `nosniff` e il tipo canonico della
 * nostra lista — mai quello dichiarato da chi l'ha caricato.
 */
export const GET = route(async (_request: Request, ctx: Contesto) => {
  await requireUser();
  const { id } = await ctx.params;

  const allegato = await prisma.attachment.findUnique({
    where: { id },
    select: RIFERIMENTI,
  });
  if (!allegato) return fail(404, 'Allegato non trovato.', 'non_trovato');

  await requirePermission(permessiAllegato(allegato).leggi);

  try {
    const contenuto = await leggiAllegato(allegato.storageKey);
    return new NextResponse(new Uint8Array(contenuto), {
      status: 200,
      headers: intestazioniDownload(
        allegato.filename,
        allegato.mimeType,
        contenuto.byteLength,
      ),
    });
  } catch (err) {
    if (err instanceof UploadError) return fail(err.status, err.message, 'allegato');
    throw err;
  }
});

/**
 * Rimuove l'allegato: prima la riga (è quella che rende il file raggiungibile),
 * poi il file. Nell'ordine inverso un errore lascerebbe una riga che punta al
 * vuoto e un download che fallisce senza spiegazione.
 */
export const DELETE = route(async (_request: Request, ctx: Contesto) => {
  const utente = await requireUser();
  const { id } = await ctx.params;

  const allegato = await prisma.attachment.findUnique({
    where: { id },
    select: RIFERIMENTI,
  });
  if (!allegato) return fail(404, 'Allegato non trovato.', 'non_trovato');

  await requirePermission(permessiAllegato(allegato).scrivi);

  await prisma.attachment.delete({ where: { id } });
  await eliminaAllegato(allegato.storageKey);

  await audit({
    userId: utente.id,
    action: 'DELETE',
    entity: 'Attachment',
    entityId: id,
    summary: `Allegato rimosso: ${allegato.filename}`,
    changes: {
      productId: allegato.productId,
      purchaseOrderId: allegato.purchaseOrderId,
      salesOrderId: allegato.salesOrderId,
      goodsReceiptId: allegato.goodsReceiptId,
    },
  });

  return ok({ id });
});
