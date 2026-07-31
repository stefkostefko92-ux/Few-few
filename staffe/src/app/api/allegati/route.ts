import { requirePermission, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, fail, meta, ok, pagination, route } from '@/lib/api';
import {
  UploadError,
  eliminaAllegato,
  permessiAllegato,
  salvaAllegato,
} from '@/lib/uploads';
import { allegatoMetaSchema } from '@/lib/validation/inventario';

/** Elenco degli allegati di UN documento (mai del magazzino intero). */
export const GET = route(async (request: Request) => {
  await requireUser();

  const url = new URL(request.url);
  const rif = allegatoMetaSchema.parse({
    productId: url.searchParams.get('productId') ?? undefined,
    purchaseOrderId: url.searchParams.get('purchaseOrderId') ?? undefined,
    salesOrderId: url.searchParams.get('salesOrderId') ?? undefined,
    goodsReceiptId: url.searchParams.get('goodsReceiptId') ?? undefined,
  });
  await requirePermission(permessiAllegato(rif).leggi);

  const where = {
    productId: rif.productId ?? undefined,
    purchaseOrderId: rif.purchaseOrderId ?? undefined,
    salesOrderId: rif.salesOrderId ?? undefined,
    goodsReceiptId: rif.goodsReceiptId ?? undefined,
  };
  const p = pagination(url, 50);

  const [totale, allegati] = await Promise.all([
    prisma.attachment.count({ where }),
    prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: p.skip,
      take: p.take,
      select: {
        id: true,
        kind: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return ok(allegati, meta(p, totale));
});

/**
 * Caricamento di un allegato (`multipart/form-data`).
 *
 * La chiave di archiviazione la genera il server: il nome inviato dal client
 * non partecipa mai alla costruzione del percorso su disco (nessun percorso
 * risalente possibile). Vedi `src/lib/uploads.ts` per l'elenco chiuso dei
 * formati, il tetto di dimensione e il controllo della firma del file.
 */
export const POST = route(async (request: Request) => {
  const utente = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(
      400,
      'Richiesta non valida: attesa una form multipart con il file.',
      'formato',
    );
  }

  const campo = (nome: string) => {
    const v = form.get(nome);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const rif = allegatoMetaSchema.parse({
    kind: campo('kind'),
    productId: campo('productId'),
    purchaseOrderId: campo('purchaseOrderId'),
    salesOrderId: campo('salesOrderId'),
    goodsReceiptId: campo('goodsReceiptId'),
  });
  // L'allegato eredita i permessi del documento a cui è appeso.
  await requirePermission(permessiAllegato(rif).scrivi);

  const file = form.get('file');
  if (!(file instanceof File)) {
    return fail(400, 'Nessun file caricato.', 'file_mancante');
  }

  // Il documento deve esistere: un allegato orfano non sarebbe raggiungibile da
  // nessuna schermata e nessuno lo cancellerebbe mai.
  let esiste = 0;
  if (rif.productId) {
    esiste = await prisma.product.count({ where: { id: rif.productId } });
  } else if (rif.purchaseOrderId) {
    esiste = await prisma.purchaseOrder.count({ where: { id: rif.purchaseOrderId } });
  } else if (rif.salesOrderId) {
    esiste = await prisma.salesOrder.count({ where: { id: rif.salesOrderId } });
  } else if (rif.goodsReceiptId) {
    esiste = await prisma.goodsReceipt.count({ where: { id: rif.goodsReceiptId } });
  }
  if (esiste === 0) {
    return fail(404, 'Documento di destinazione non trovato.', 'non_trovato');
  }

  let salvato;
  try {
    salvato = await salvaAllegato(file);
  } catch (err) {
    if (err instanceof UploadError) return fail(err.status, err.message, 'allegato');
    throw err;
  }

  let allegato;
  try {
    allegato = await prisma.attachment.create({
      data: {
        kind: rif.kind ?? salvato.kind,
        filename: salvato.filename,
        mimeType: salvato.mimeType,
        sizeBytes: salvato.sizeBytes,
        storageKey: salvato.storageKey,
        productId: rif.productId,
        purchaseOrderId: rif.purchaseOrderId,
        salesOrderId: rif.salesOrderId,
        goodsReceiptId: rif.goodsReceiptId,
        uploadedById: utente.id,
      },
      select: {
        id: true,
        kind: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  } catch (err) {
    // Riga non scritta: il file appena salvato non deve restare sul disco.
    await eliminaAllegato(salvato.storageKey);
    throw err;
  }

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'Attachment',
    entityId: allegato.id,
    summary: `Allegato caricato: ${allegato.filename} (${allegato.sizeBytes} byte)`,
    changes: {
      kind: allegato.kind,
      productId: rif.productId,
      purchaseOrderId: rif.purchaseOrderId,
      salesOrderId: rif.salesOrderId,
      goodsReceiptId: rif.goodsReceiptId,
    },
  });

  return created(allegato);
});
