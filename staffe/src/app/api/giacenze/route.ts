import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';
import { statoScortaSchema, type StatoScorta } from '@/lib/validation/prodotti';
import {
  GIACENZA_ZERO,
  giacenzePerProdotto,
  ubicazioniDeiProdotti,
  whereProdotti,
} from '@/components/prodotti/dati';

/**
 * Giacenze vive: una riga per prodotto con il dettaglio per ubicazione.
 *
 * `qty` è la quantità fisica, `reservedQty` quella impegnata da ordini
 * confermati, `availableQty` ciò che resta davvero vendibile. Mostrare solo la
 * prima farebbe vendere due volte lo stesso pezzo.
 */
export const GET = route(async (request: Request) => {
  const user = await requirePermission('giacenze:leggi');
  const url = new URL(request.url);
  const p = pagination(url, 50);
  const ubicazioneId = url.searchParams.get('ubicazioneId');

  const where = whereProdotti({
    q: url.searchParams.get('q'),
    categoriaId: url.searchParams.get('categoriaId'),
    fornitoreId: url.searchParams.get('fornitoreId'),
    soloAttivi: url.searchParams.get('attivi') !== '0',
  });
  if (ubicazioneId) where.stockItems = { some: { locationId: ubicazioneId } };

  // Le scorciatoie `?sottoScorta=1` / `?esaurito=1` restano supportate perché
  // sono i due allarmi che si aprono da un collegamento diretto.
  let stato: StatoScorta = statoScortaSchema.parse(url.searchParams.get('stato') ?? 'tutti');
  if (url.searchParams.get('sottoScorta') === '1') stato = 'sotto';
  if (url.searchParams.get('esaurito') === '1') stato = 'esaurito';

  const universo = await prisma.product.findMany({
    where,
    select: { id: true, costCents: true, minStock: true },
  });
  const giacenzeUniverso = await giacenzePerProdotto(universo.map((x) => x.id));

  const selezionati = universo.filter((prodotto) => {
    const qty = giacenzeUniverso.get(prodotto.id)?.qty ?? 0;
    if (stato === 'esaurito') return qty <= 0;
    if (stato === 'sotto') return qty > 0 && qty <= prodotto.minStock;
    if (stato === 'ok') return qty > prodotto.minStock;
    return true;
  });

  const totali = selezionati.reduce(
    (acc, prodotto) => {
      const qty = giacenzeUniverso.get(prodotto.id)?.qty ?? 0;
      acc.articoli += 1;
      acc.pezzi += qty;
      acc.valoreCents += qty * prodotto.costCents;
      if (qty <= 0) acc.esauriti += 1;
      else if (qty <= prodotto.minStock) acc.sottoScorta += 1;
      return acc;
    },
    { articoli: 0, pezzi: 0, valoreCents: 0, sottoScorta: 0, esauriti: 0 },
  );

  const idsSelezionati = selezionati.map((x) => x.id);
  const prodotti = await prisma.product.findMany({
    where: { id: { in: idsSelezionati } },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ sku: 'asc' }],
    skip: p.skip,
    take: p.take,
  });

  const dettaglio = await ubicazioniDeiProdotti(prodotti.map((x) => x.id));
  const vedeCosti = can(user.role, 'costi:leggi');

  const righe = prodotti.map(({ costCents, ...prodotto }) => {
    const giacenza = giacenzeUniverso.get(prodotto.id) ?? GIACENZA_ZERO;
    return {
      ...prodotto,
      ...(vedeCosti ? { costCents, valoreCents: giacenza.qty * costCents } : {}),
      giacenza,
      ubicazioni: dettaglio
        .filter(
          (r) => r.productId === prodotto.id && (!ubicazioneId || r.location.id === ubicazioneId),
        )
        .map((r) => ({
          locationId: r.location.id,
          code: r.location.code,
          kind: r.location.kind,
          lotto: r.batch?.code ?? null,
          qty: r.qty,
          reservedQty: r.reservedQty,
          availableQty: r.qty - r.reservedQty,
        })),
    };
  });

  return ok(
    {
      righe,
      totali: vedeCosti ? totali : { ...totali, valoreCents: undefined },
    },
    meta(p, selezionati.length),
  );
});
