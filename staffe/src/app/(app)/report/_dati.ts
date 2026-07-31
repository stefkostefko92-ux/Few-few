import type { MovementType, Prisma, Uom } from '@prisma/client';
import { prisma } from '@/lib/db';
import { applyBp, lineNetCents, roundHalfUp } from '@/lib/money';
import {
  costoMedioPonderato,
  filtroData,
  giorniFra,
  indiceRotazione,
  margine,
  mediaOppureNull,
  quota,
  TIPI_CONSUMO,
  TIPI_USCITA,
  type Periodo,
  type RigaCosto,
} from '@/lib/report';
import {
  giorniDiCopertura,
  prevediConsumo,
  puntoDiRiordino,
  quantitaDiRiordino,
  rilevaLentiMovimenti,
  type Confidenza,
  type LivelloServizio,
  type Previsione,
} from '@/lib/forecast';

/**
 * Query dei report — l'unico posto in cui i numeri del cruscotto, dei report e
 * delle esportazioni vengono estratti dal database.
 *
 * Perché qui e non nelle pagine: la stessa metrica deve dare lo stesso numero
 * a schermo, nel CSV e nella stampa. Se ogni pagina scrivesse la sua query, due
 * viste dello stesso dato divergerebbero e nessuno saprebbe quale credere. Le
 * DEFINIZIONI delle metriche stanno in `@/lib/report`; qui c'è solo la loro
 * traduzione in SQL (via Prisma).
 *
 * Nota di scala: alcune aggregazioni (costo medio ponderato, fatturato per
 * riga) leggono le righe e sommano in JavaScript, perché Prisma non aggrega
 * `qty × prezzo`. Per il volume di una piccola azienda (decine di migliaia di
 * movimenti) è adeguato; oltre, va sostituito con una vista materializzata.
 */

// ─────────────────────────── Blocchi comuni ───────────────────────────

const TRASFERIMENTO: MovementType = 'TRASFERIMENTO';

export type Giacenza = { qty: number; reservedQty: number };

/** Giacenza per prodotto: somma di StockItem su tutte le ubicazioni e i lotti. */
export async function giacenzePerProdotto(): Promise<Map<string, Giacenza>> {
  const righe = await prisma.stockItem.groupBy({
    by: ['productId'],
    _sum: { qty: true, reservedQty: true },
  });
  return new Map(
    righe.map((r) => [
      r.productId,
      { qty: r._sum.qty ?? 0, reservedQty: r._sum.reservedQty ?? 0 },
    ]),
  );
}

/**
 * Costo medio ponderato per prodotto, dai movimenti di RICEVIMENTO con costo
 * valorizzato. Chiave assente = nessun ricevimento utile (chi chiama ricade sul
 * costo di anagrafica e lo dichiara).
 */
export async function costiMediPonderati(
  periodo?: Periodo,
): Promise<Map<string, number>> {
  const movimenti = await prisma.stockMovement.findMany({
    where: {
      type: 'RICEVIMENTO',
      unitCostCents: { gt: 0 },
      ...(periodo?.da ? { createdAt: filtroData(periodo) } : {}),
    },
    select: { productId: true, qty: true, unitCostCents: true },
  });

  const perProdotto = new Map<string, RigaCosto[]>();
  for (const m of movimenti) {
    const righe = perProdotto.get(m.productId);
    if (righe) righe.push(m);
    else perProdotto.set(m.productId, [m]);
  }

  const out = new Map<string, number>();
  for (const [productId, righe] of perProdotto) {
    const costo = costoMedioPonderato(righe);
    if (costo != null) out.set(productId, costo);
  }
  return out;
}

/** Merce ordinata e non ancora ricevuta, per prodotto. */
export async function merceInArrivo(): Promise<Map<string, number>> {
  const righe = await prisma.purchaseOrderLine.findMany({
    where: { order: { status: { in: ['ORDINATO', 'RICEVUTO_PARZIALE'] } } },
    select: { productId: true, qty: true, receivedQty: true },
  });
  const out = new Map<string, number>();
  for (const r of righe) {
    const residuo = Math.max(0, r.qty - r.receivedQty);
    if (residuo > 0) out.set(r.productId, (out.get(r.productId) ?? 0) + residuo);
  }
  return out;
}

type RigaImporto = { qty: number; unitPriceCents: number; discountBp: number };

/**
 * Imponibile di ogni riga DOPO lo sconto di testata, ripartito in proporzione.
 * La somma di queste quote è esattamente l'imponibile del documento calcolato
 * da `computeTotals` (stessa regola, stessa ultima riga che assorbe il resto):
 * così il totale del report e la sua scomposizione per cliente o categoria non
 * possono divergere di un centesimo.
 */
function nettiDiRiga(righe: readonly RigaImporto[], scontoTestataBp: number): number[] {
  const netti = righe.map((r) => lineNetCents(r.qty, r.unitPriceCents, r.discountBp));
  const lordo = netti.reduce((a, b) => a + b, 0);
  const sconto = applyBp(lordo, scontoTestataBp);
  let assegnato = 0;
  return netti.map((netto, i) => {
    const parte =
      i === netti.length - 1
        ? sconto - assegnato
        : lordo === 0
          ? 0
          : roundHalfUp((sconto * netto) / lordo);
    assegnato += parte;
    return netto - parte;
  });
}

/** Filtro «data dell'ordine, altrimenti data di creazione». */
function filtroDataOrdine(periodo: Periodo): Prisma.SalesOrderWhereInput {
  const range = filtroData(periodo);
  return {
    OR: [{ orderedAt: range }, { orderedAt: null, createdAt: range }],
  };
}

// ─────────────────────────── Valorizzazione ───────────────────────────

export type FonteCosto = 'movimenti' | 'anagrafica' | 'assente';

export type RigaValorizzazione = {
  productId: string;
  sku: string;
  nome: string;
  categoria: string;
  uom: Uom;
  giacenza: number;
  impegnata: number;
  costoUnitarioCents: number;
  fonteCosto: FonteCosto;
  valoreCents: number;
};

export type EsitoValorizzazione = {
  righe: RigaValorizzazione[];
  totaleValoreCents: number;
  totalePezzi: number;
  perCategoria: Array<{ categoria: string; pezzi: number; valoreCents: number }>;
  fonti: Record<FonteCosto, number>;
};

export async function datiValorizzazione(periodo: Periodo): Promise<EsitoValorizzazione> {
  const [prodotti, giacenze, costi] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        uom: true,
        costCents: true,
        category: { select: { name: true } },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sku: 'asc' }],
    }),
    giacenzePerProdotto(),
    costiMediPonderati(periodo),
  ]);

  const fonti: Record<FonteCosto, number> = { movimenti: 0, anagrafica: 0, assente: 0 };
  const righe: RigaValorizzazione[] = prodotti.map((p) => {
    const g = giacenze.get(p.id) ?? { qty: 0, reservedQty: 0 };
    const daMovimenti = costi.get(p.id);
    const fonteCosto: FonteCosto =
      daMovimenti != null ? 'movimenti' : p.costCents > 0 ? 'anagrafica' : 'assente';
    fonti[fonteCosto] += 1;
    const costoUnitarioCents = daMovimenti ?? p.costCents;
    return {
      productId: p.id,
      sku: p.sku,
      nome: p.name,
      categoria: p.category.name,
      uom: p.uom,
      giacenza: g.qty,
      impegnata: g.reservedQty,
      costoUnitarioCents,
      fonteCosto,
      valoreCents: g.qty * costoUnitarioCents,
    };
  });

  const perCategoria = new Map<string, { pezzi: number; valoreCents: number }>();
  for (const r of righe) {
    const acc = perCategoria.get(r.categoria) ?? { pezzi: 0, valoreCents: 0 };
    acc.pezzi += r.giacenza;
    acc.valoreCents += r.valoreCents;
    perCategoria.set(r.categoria, acc);
  }

  return {
    righe,
    totaleValoreCents: righe.reduce((a, r) => a + r.valoreCents, 0),
    totalePezzi: righe.reduce((a, r) => a + r.giacenza, 0),
    perCategoria: [...perCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.valoreCents - a.valoreCents),
    fonti,
  };
}

// ─────────────────────────── Movimenti ───────────────────────────

export type RigaMovimenti = {
  productId: string;
  sku: string;
  nome: string;
  uom: Uom;
  entrate: number;
  uscite: number;
  saldo: number;
  numeroMovimenti: number;
  giacenza: number;
  rotazione: number | null;
};

export type EsitoMovimenti = {
  righe: RigaMovimenti[];
  perTipo: Array<{ tipo: MovementType; movimenti: number; pezzi: number }>;
  totaleEntrate: number;
  totaleUscite: number;
  totaleMovimenti: number;
};

export async function datiMovimenti(periodo: Periodo): Promise<EsitoMovimenti> {
  const range = filtroData(periodo);
  const [entrate, uscite, perTipo, giacenze] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { createdAt: range, toLocationId: { not: null }, type: { not: TRASFERIMENTO } },
      _sum: { qty: true },
      _count: { _all: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { createdAt: range, fromLocationId: { not: null }, type: { not: TRASFERIMENTO } },
      _sum: { qty: true },
      _count: { _all: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['type'],
      where: { createdAt: range },
      _sum: { qty: true },
      _count: { _all: true },
    }),
    giacenzePerProdotto(),
  ]);

  const acc = new Map<string, { entrate: number; uscite: number; numeroMovimenti: number }>();
  const tocca = (id: string) => {
    const v = acc.get(id) ?? { entrate: 0, uscite: 0, numeroMovimenti: 0 };
    acc.set(id, v);
    return v;
  };
  for (const r of entrate) {
    const v = tocca(r.productId);
    v.entrate += r._sum.qty ?? 0;
    v.numeroMovimenti += r._count._all;
  }
  for (const r of uscite) {
    const v = tocca(r.productId);
    v.uscite += r._sum.qty ?? 0;
    v.numeroMovimenti += r._count._all;
  }

  const prodotti = await prisma.product.findMany({
    where: { id: { in: [...acc.keys()] } },
    select: { id: true, sku: true, name: true, uom: true },
  });

  const righe: RigaMovimenti[] = prodotti.map((p) => {
    const v = acc.get(p.id) ?? { entrate: 0, uscite: 0, numeroMovimenti: 0 };
    const giacenza = giacenze.get(p.id)?.qty ?? 0;
    return {
      productId: p.id,
      sku: p.sku,
      nome: p.name,
      uom: p.uom,
      entrate: v.entrate,
      uscite: v.uscite,
      saldo: v.entrate - v.uscite,
      numeroMovimenti: v.numeroMovimenti,
      giacenza,
      rotazione: indiceRotazione(v.uscite, giacenza),
    };
  });
  righe.sort((a, b) => b.uscite - a.uscite || b.entrate - a.entrate);

  return {
    righe,
    perTipo: perTipo
      .map((t) => ({ tipo: t.type, movimenti: t._count._all, pezzi: t._sum.qty ?? 0 }))
      .sort((a, b) => b.movimenti - a.movimenti),
    totaleEntrate: righe.reduce((a, r) => a + r.entrate, 0),
    totaleUscite: righe.reduce((a, r) => a + r.uscite, 0),
    totaleMovimenti: perTipo.reduce((a, t) => a + t._count._all, 0),
  };
}

// ─────────────────────────── Vendite ───────────────────────────

/** Stati che NON sono un ricavo: un preventivo non è una vendita. */
const STATI_VENDITA_ESCLUSI = ['BOZZA', 'PREVENTIVO', 'ANNULLATO'] as const;

export type EsitoVendite = {
  /** Falso quando i costi non sono stati letti: margine da NON mostrare. */
  costiCalcolati: boolean;
  fatturatoCents: number;
  numeroOrdini: number;
  ordineMedioCents: number | null;
  pezzi: number;
  costoCents: number;
  margineCents: number;
  marginePercento: number | null;
  perCliente: Array<{ nome: string; ordini: number; pezzi: number; fatturatoCents: number }>;
  perCategoria: Array<{ categoria: string; pezzi: number; fatturatoCents: number }>;
  perProdotto: Array<{
    sku: string;
    nome: string;
    pezzi: number;
    fatturatoCents: number;
    ordini: number;
  }>;
  perGiorno: Array<{ giorno: string; fatturatoCents: number }>;
};

/**
 * `conCosti: false` salta il calcolo del costo medio ponderato (una lettura
 * dell'intero registro dei ricevimenti). Serve a chi non ha il permesso
 * `costi:leggi` e al cruscotto, che il margine non lo mostra: il dato che non
 * si mostra non si legge nemmeno dal database.
 */
export async function datiVendite(
  periodo: Periodo,
  { conCosti = true }: { conCosti?: boolean } = {},
): Promise<EsitoVendite> {
  const [ordini, costi] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        status: { notIn: [...STATI_VENDITA_ESCLUSI] },
        ...filtroDataOrdine(periodo),
      },
      select: {
        id: true,
        orderedAt: true,
        createdAt: true,
        discountBp: true,
        // Solo il nome del cliente: i report non hanno bisogno di indirizzi,
        // PEC o partite IVA, e ciò che non serve non si legge.
        customer: { select: { id: true, name: true } },
        lines: {
          select: {
            qty: true,
            unitPriceCents: true,
            discountBp: true,
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costCents: true,
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    conCosti ? costiMediPonderati() : Promise.resolve(new Map<string, number>()),
  ]);

  let fatturatoCents = 0;
  let costoCents = 0;
  let pezzi = 0;
  const perCliente = new Map<
    string,
    { nome: string; ordini: number; pezzi: number; fatturatoCents: number }
  >();
  const perCategoria = new Map<string, { pezzi: number; fatturatoCents: number }>();
  const perProdotto = new Map<
    string,
    { sku: string; nome: string; pezzi: number; fatturatoCents: number; ordini: number }
  >();
  const perGiorno = new Map<string, number>();

  for (const ordine of ordini) {
    const netti = nettiDiRiga(ordine.lines, ordine.discountBp);
    const nettoOrdine = netti.reduce((a, b) => a + b, 0);
    fatturatoCents += nettoOrdine;

    const cliente = perCliente.get(ordine.customer.id) ?? {
      nome: ordine.customer.name,
      ordini: 0,
      pezzi: 0,
      fatturatoCents: 0,
    };
    cliente.ordini += 1;
    cliente.fatturatoCents += nettoOrdine;

    const data = ordine.orderedAt ?? ordine.createdAt;
    const giorno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + nettoOrdine);

    ordine.lines.forEach((riga, i) => {
      const netto = netti[i];
      pezzi += riga.qty;
      cliente.pezzi += riga.qty;
      if (conCosti) {
        costoCents += riga.qty * (costi.get(riga.product.id) ?? riga.product.costCents);
      }

      const categoria = riga.product.category.name;
      const cat = perCategoria.get(categoria) ?? { pezzi: 0, fatturatoCents: 0 };
      cat.pezzi += riga.qty;
      cat.fatturatoCents += netto;
      perCategoria.set(categoria, cat);

      const prod = perProdotto.get(riga.product.id) ?? {
        sku: riga.product.sku,
        nome: riga.product.name,
        pezzi: 0,
        fatturatoCents: 0,
        ordini: 0,
      };
      prod.pezzi += riga.qty;
      prod.fatturatoCents += netto;
      prod.ordini += 1;
      perProdotto.set(riga.product.id, prod);
    });

    perCliente.set(ordine.customer.id, cliente);
  }

  // Senza costi il margine non è zero: è NON CALCOLATO. Restituirlo come 0
  // farebbe leggere «margine nullo» dove non c'è alcuna misura.
  const { margineCents, marginePercento } = conCosti
    ? margine(fatturatoCents, costoCents)
    : { margineCents: 0, marginePercento: null };

  return {
    costiCalcolati: conCosti,
    fatturatoCents,
    numeroOrdini: ordini.length,
    ordineMedioCents: ordini.length === 0 ? null : Math.round(fatturatoCents / ordini.length),
    pezzi,
    costoCents,
    margineCents,
    marginePercento,
    perCliente: [...perCliente.values()].sort((a, b) => b.fatturatoCents - a.fatturatoCents),
    perCategoria: [...perCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.fatturatoCents - a.fatturatoCents),
    perProdotto: [...perProdotto.values()].sort((a, b) => b.pezzi - a.pezzi),
    perGiorno: [...perGiorno.entries()]
      .map(([giorno, fatturatoCents]) => ({ giorno, fatturatoCents }))
      .sort((a, b) => a.giorno.localeCompare(b.giorno)),
  };
}

// ─────────────────────────── Acquisti ───────────────────────────

const STATI_ACQUISTO_ESCLUSI = ['BOZZA', 'ANNULLATO'] as const;

export type EsitoAcquisti = {
  spesaCents: number;
  numeroOrdini: number;
  ordineMedioCents: number | null;
  pezzi: number;
  perFornitore: Array<{
    nome: string;
    ordini: number;
    pezzi: number;
    spesaCents: number;
    trasportoCents: number;
  }>;
  perCategoria: Array<{ categoria: string; pezzi: number; spesaCents: number }>;
};

export async function datiAcquisti(periodo: Periodo): Promise<EsitoAcquisti> {
  const range = filtroData(periodo);
  const ordini = await prisma.purchaseOrder.findMany({
    where: {
      status: { notIn: [...STATI_ACQUISTO_ESCLUSI] },
      OR: [{ orderedAt: range }, { orderedAt: null, createdAt: range }],
    },
    select: {
      id: true,
      shippingCents: true,
      supplier: { select: { id: true, name: true } },
      lines: {
        select: {
          qty: true,
          unitCostCents: true,
          discountBp: true,
          product: { select: { id: true, category: { select: { name: true } } } },
        },
      },
    },
  });

  let spesaCents = 0;
  let pezzi = 0;
  const perFornitore = new Map<
    string,
    { nome: string; ordini: number; pezzi: number; spesaCents: number; trasportoCents: number }
  >();
  const perCategoria = new Map<string, { pezzi: number; spesaCents: number }>();

  for (const ordine of ordini) {
    const netti = nettiDiRiga(
      ordine.lines.map((l) => ({
        qty: l.qty,
        unitPriceCents: l.unitCostCents,
        discountBp: l.discountBp,
      })),
      0,
    );
    const nettoOrdine = netti.reduce((a, b) => a + b, 0) + ordine.shippingCents;
    spesaCents += nettoOrdine;

    const f = perFornitore.get(ordine.supplier.id) ?? {
      nome: ordine.supplier.name,
      ordini: 0,
      pezzi: 0,
      spesaCents: 0,
      trasportoCents: 0,
    };
    f.ordini += 1;
    f.spesaCents += nettoOrdine;
    f.trasportoCents += ordine.shippingCents;

    ordine.lines.forEach((riga, i) => {
      pezzi += riga.qty;
      f.pezzi += riga.qty;
      const categoria = riga.product.category.name;
      const cat = perCategoria.get(categoria) ?? { pezzi: 0, spesaCents: 0 };
      cat.pezzi += riga.qty;
      cat.spesaCents += netti[i];
      perCategoria.set(categoria, cat);
    });

    perFornitore.set(ordine.supplier.id, f);
  }

  return {
    spesaCents,
    numeroOrdini: ordini.length,
    ordineMedioCents: ordini.length === 0 ? null : Math.round(spesaCents / ordini.length),
    pezzi,
    perFornitore: [...perFornitore.values()].sort((a, b) => b.spesaCents - a.spesaCents),
    perCategoria: [...perCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.spesaCents - a.spesaCents),
  };
}

// ─────────────────────────── Fornitori ───────────────────────────

export type RigaFornitore = {
  fornitoreId: string;
  nome: string;
  ordiniRicevuti: number;
  leadTimeMedio: number | null;
  leadTimeDichiarato: number;
  scostamentoLeadTime: number | null;
  ordiniCompleti: number;
  quotaCompleti: number | null;
  ordiniInRitardo: number;
  ordiniConDataPrevista: number;
  quotaPuntuali: number | null;
  ritardoMedio: number | null;
};

export async function datiFornitori(periodo: Periodo): Promise<RigaFornitore[]> {
  const ordini = await prisma.purchaseOrder.findMany({
    where: {
      status: { in: ['RICEVUTO', 'RICEVUTO_PARZIALE'] },
      receivedAt: filtroData(periodo),
    },
    select: {
      orderedAt: true,
      expectedAt: true,
      receivedAt: true,
      supplier: { select: { id: true, name: true, leadTimeDays: true } },
      lines: { select: { qty: true, receivedQty: true } },
    },
  });

  type Acc = {
    nome: string;
    leadTimeDichiarato: number;
    ordiniRicevuti: number;
    leadTimes: number[];
    completi: number;
    conDataPrevista: number;
    inRitardo: number;
    ritardi: number[];
  };
  const acc = new Map<string, Acc>();

  for (const o of ordini) {
    const a = acc.get(o.supplier.id) ?? {
      nome: o.supplier.name,
      leadTimeDichiarato: o.supplier.leadTimeDays,
      ordiniRicevuti: 0,
      leadTimes: [],
      completi: 0,
      conDataPrevista: 0,
      inRitardo: 0,
      ritardi: [],
    };
    a.ordiniRicevuti += 1;

    if (o.orderedAt && o.receivedAt) {
      a.leadTimes.push(Math.max(0, giorniFra(o.orderedAt, o.receivedAt)));
    }
    if (o.lines.length > 0 && o.lines.every((l) => l.receivedQty >= l.qty)) {
      a.completi += 1;
    }
    if (o.expectedAt && o.receivedAt) {
      a.conDataPrevista += 1;
      const ritardo = giorniFra(o.expectedAt, o.receivedAt);
      if (ritardo > 0) {
        a.inRitardo += 1;
        a.ritardi.push(ritardo);
      }
    }
    acc.set(o.supplier.id, a);
  }

  return [...acc.entries()]
    .map(([fornitoreId, a]) => {
      const leadTimeMedio = mediaOppureNull(a.leadTimes);
      return {
        fornitoreId,
        nome: a.nome,
        ordiniRicevuti: a.ordiniRicevuti,
        leadTimeMedio: leadTimeMedio == null ? null : Math.round(leadTimeMedio * 10) / 10,
        leadTimeDichiarato: a.leadTimeDichiarato,
        scostamentoLeadTime:
          leadTimeMedio == null
            ? null
            : Math.round((leadTimeMedio - a.leadTimeDichiarato) * 10) / 10,
        ordiniCompleti: a.completi,
        quotaCompleti: quota(a.completi, a.ordiniRicevuti),
        ordiniInRitardo: a.inRitardo,
        ordiniConDataPrevista: a.conDataPrevista,
        quotaPuntuali:
          a.conDataPrevista === 0 ? null : quota(a.conDataPrevista - a.inRitardo, a.conDataPrevista),
        ritardoMedio:
          a.ritardi.length === 0
            ? null
            : Math.round((mediaOppureNull(a.ritardi) ?? 0) * 10) / 10,
      };
    })
    .sort((a, b) => b.ordiniRicevuti - a.ordiniRicevuti);
}

// ─────────────────────────── Scorte ───────────────────────────

export type StatoScorta = 'esaurito' | 'sotto_scorta' | 'morta' | 'regolare';

export type RigaScorte = {
  productId: string;
  sku: string;
  nome: string;
  categoria: string;
  uom: Uom;
  giacenza: number;
  disponibile: number;
  minStock: number;
  maxStock: number | null;
  ultimaUscita: Date | null;
  giorniDaUltimaUscita: number | null;
  stato: StatoScorta;
  valoreCents: number;
};

export type EsitoScorte = {
  righe: RigaScorte[];
  conteggi: Record<StatoScorta, number>;
  valoreMortoCents: number;
  giorniMorta: number;
  totaleProdotti: number;
};

/** Ultima uscita per prodotto (qualunque causale d'uscita, non solo la vendita). */
export async function ultimeUscite(): Promise<Map<string, Date>> {
  const righe = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { fromLocationId: { not: null }, type: { not: TRASFERIMENTO } },
    _max: { createdAt: true },
  });
  const out = new Map<string, Date>();
  for (const r of righe) {
    if (r._max.createdAt) out.set(r.productId, r._max.createdAt);
  }
  return out;
}

export async function datiScorte(giorniMorta = 90): Promise<EsitoScorte> {
  const [prodotti, giacenze, uscite, costi] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        uom: true,
        minStock: true,
        maxStock: true,
        costCents: true,
        category: { select: { name: true } },
      },
      orderBy: { sku: 'asc' },
    }),
    giacenzePerProdotto(),
    ultimeUscite(),
    costiMediPonderati(),
  ]);

  const classificati = rilevaLentiMovimenti(
    prodotti.map((p) => ({
      id: p.id,
      giacenza: giacenzaDi(giacenze, p.id).qty,
      ultimaUscita: uscite.get(p.id) ?? null,
    })),
    { giorniMorto: giorniMorta },
  );
  const perId = new Map(classificati.map((c) => [c.id, c]));

  const conteggi: Record<StatoScorta, number> = {
    esaurito: 0,
    sotto_scorta: 0,
    morta: 0,
    regolare: 0,
  };
  let valoreMortoCents = 0;

  const righe: RigaScorte[] = prodotti.map((p) => {
    const g = giacenzaDi(giacenze, p.id);
    const classificato = perId.get(p.id);
    const costo = costi.get(p.id) ?? p.costCents;
    const stato: StatoScorta =
      g.qty <= 0
        ? 'esaurito'
        : g.qty <= p.minStock
          ? 'sotto_scorta'
          : classificato?.stato === 'morto'
            ? 'morta'
            : 'regolare';
    conteggi[stato] += 1;
    const valoreCents = g.qty * costo;
    if (stato === 'morta') valoreMortoCents += valoreCents;
    return {
      productId: p.id,
      sku: p.sku,
      nome: p.name,
      categoria: p.category.name,
      uom: p.uom,
      giacenza: g.qty,
      disponibile: g.qty - g.reservedQty,
      minStock: p.minStock,
      maxStock: p.maxStock,
      ultimaUscita: uscite.get(p.id) ?? null,
      giorniDaUltimaUscita: classificato?.giorniDaUltimaUscita ?? null,
      stato,
      valoreCents,
    };
  });

  return {
    righe,
    conteggi,
    valoreMortoCents,
    giorniMorta,
    totaleProdotti: prodotti.length,
  };
}

function giacenzaDi(mappa: Map<string, Giacenza>, id: string): Giacenza {
  return mappa.get(id) ?? { qty: 0, reservedQty: 0 };
}

// ─────────────────────────── Previsioni ───────────────────────────

export type RigaPrevisione = {
  productId: string;
  sku: string;
  nome: string;
  uom: Uom;
  disponibile: number;
  inArrivo: number;
  consumoGiornaliero: number | null;
  tendenzaGiornaliera: number | null;
  copertura: number | null;
  leadTimeGiorni: number;
  puntoDiRiordino: number | null;
  scortaSicurezza: number | null;
  quantitaSuggerita: number;
  notaQuantita: string;
  metodo: string;
  confidenza: Confidenza;
  stato: Previsione['stato'];
  motivo: string;
};

export type EsitoPrevisioni = {
  righe: RigaPrevisione[];
  giorniFinestra: number;
  livelloServizio: LivelloServizio;
  daRiordinare: number;
  pezziSuggeriti: number;
};

export async function datiPrevisioni({
  giorni = 90,
  livelloServizio = 95 as LivelloServizio,
  leadTimePredefinito = 7,
}: {
  giorni?: number;
  livelloServizio?: LivelloServizio;
  leadTimePredefinito?: number;
} = {}): Promise<EsitoPrevisioni> {
  const inizio = new Date();
  inizio.setDate(inizio.getDate() - giorni);
  inizio.setHours(0, 0, 0, 0);

  const [prodotti, movimenti, giacenze, inArrivo] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        uom: true,
        maxStock: true,
        supplier: { select: { leadTimeDays: true } },
      },
      orderBy: { sku: 'asc' },
    }),
    prisma.stockMovement.findMany({
      where: { type: { in: [...TIPI_CONSUMO] }, createdAt: { gte: inizio } },
      select: { productId: true, qty: true, createdAt: true },
    }),
    giacenzePerProdotto(),
    merceInArrivo(),
  ]);

  const perProdotto = new Map<string, Array<{ data: Date; qty: number }>>();
  for (const m of movimenti) {
    const lista = perProdotto.get(m.productId);
    const voce = { data: m.createdAt, qty: m.qty };
    if (lista) lista.push(voce);
    else perProdotto.set(m.productId, [voce]);
  }

  const righe: RigaPrevisione[] = prodotti.map((p) => {
    const g = giacenzaDi(giacenze, p.id);
    const disponibile = g.qty - g.reservedQty;
    const arrivo = inArrivo.get(p.id) ?? 0;
    const leadTimeGiorni = p.supplier?.leadTimeDays ?? leadTimePredefinito;
    const previsione = prevediConsumo(perProdotto.get(p.id) ?? [], { giorni });

    const base = {
      productId: p.id,
      sku: p.sku,
      nome: p.name,
      uom: p.uom,
      disponibile,
      inArrivo: arrivo,
      leadTimeGiorni,
      stato: previsione.stato,
    };

    if (previsione.stato !== 'ok') {
      // Nessun numero inventato: senza previsione non si propone una quantità.
      return {
        ...base,
        consumoGiornaliero:
          previsione.stato === 'dati_insufficienti' ? previsione.consumoOsservato : 0,
        tendenzaGiornaliera: null,
        copertura: null,
        puntoDiRiordino: null,
        scortaSicurezza: null,
        quantitaSuggerita: 0,
        notaQuantita:
          previsione.stato === 'nessun_consumo'
            ? 'Nessun consumo nel periodo: nessun riordino proposto.'
            : 'Dati insufficienti: nessun riordino proposto.',
        metodo: previsione.stato === 'nessun_consumo' ? 'nessun consumo' : 'dati insufficienti',
        confidenza: 'nulla' as Confidenza,
        motivo: previsione.motivo,
      };
    }

    const rop = puntoDiRiordino({
      consumoGiornaliero: previsione.consumoGiornaliero,
      leadTimeGiorni,
      deviazioneStandard: previsione.deviazioneStandard,
      livelloServizio,
    });
    const suggerita = quantitaDiRiordino({
      disponibile,
      inArrivo: arrivo,
      puntoDiRiordino: rop.puntoDiRiordino,
      maxStock: p.maxStock,
      consumoGiornaliero: previsione.consumoGiornaliero,
    });

    return {
      ...base,
      consumoGiornaliero: previsione.consumoGiornaliero,
      tendenzaGiornaliera: previsione.tendenzaGiornaliera,
      copertura: giorniDiCopertura(disponibile, previsione.consumoGiornaliero),
      puntoDiRiordino: rop.puntoDiRiordino,
      scortaSicurezza: rop.scortaSicurezza,
      quantitaSuggerita: suggerita.quantita,
      notaQuantita: suggerita.nota,
      metodo: previsione.metodo === 'holt_winters' ? 'Holt-Winters (7 gg)' : 'Holt',
      confidenza: previsione.confidenza,
      motivo: `Finestra ${previsione.giorniFinestra} gg, ${previsione.giorniConMovimento} giorni movimentati.`,
    };
  });

  righe.sort((a, b) => {
    if (b.quantitaSuggerita !== a.quantitaSuggerita) {
      return b.quantitaSuggerita - a.quantitaSuggerita;
    }
    return (a.copertura ?? Number.POSITIVE_INFINITY) - (b.copertura ?? Number.POSITIVE_INFINITY);
  });

  return {
    righe,
    giorniFinestra: giorni,
    livelloServizio,
    daRiordinare: righe.filter((r) => r.quantitaSuggerita > 0).length,
    pezziSuggeriti: righe.reduce((a, r) => a + r.quantitaSuggerita, 0),
  };
}

// ─────────────────────────── Cruscotto ───────────────────────────

export type EsitoCruscotto = {
  giacenzaTotale: number;
  prodottiAttivi: number;
  sottoScorta: number;
  esauriti: number;
  valorizzazioneCents: number | null;
  acquistiAperti: number;
  venditeAperte: number;
  merceInArrivo: number;
  spedizioniPronte: number;
  notificheAperte: number;
  venditeMese: { fatturatoCents: number; ordini: number };
  venditeMesePrecedente: { fatturatoCents: number; ordini: number };
  acquistiMese: { spesaCents: number; ordini: number };
  acquistiMesePrecedente: { spesaCents: number; ordini: number };
  piuVenduti: Array<{ sku: string; nome: string; pezzi: number; fatturatoCents: number }>;
  ultimiMovimenti: Array<{
    id: string;
    tipo: MovementType;
    qty: number;
    createdAt: Date;
    sku: string;
    nome: string;
    utente: string | null;
  }>;
};

export async function datiCruscotto({
  mese,
  mesePrecedente,
  vedeCosti,
  vedeVendite,
}: {
  mese: Periodo;
  mesePrecedente: Periodo;
  vedeCosti: boolean;
  vedeVendite: boolean;
}): Promise<EsitoCruscotto> {
  const [
    prodotti,
    giacenze,
    costi,
    acquistiAperti,
    venditeAperte,
    arrivo,
    spedizioniPronte,
    notificheAperte,
    ultimi,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, minStock: true, costCents: true },
    }),
    giacenzePerProdotto(),
    vedeCosti ? costiMediPonderati() : Promise.resolve(new Map<string, number>()),
    prisma.purchaseOrder.count({ where: { status: { in: ['ORDINATO', 'RICEVUTO_PARZIALE'] } } }),
    prisma.salesOrder.count({
      where: { status: { in: ['CONFERMATO', 'IN_PRELIEVO', 'IMBALLATO'] } },
    }),
    merceInArrivo(),
    prisma.salesOrder.count({ where: { status: 'IMBALLATO' } }),
    // Sul cruscotto conta quanti avvisi sono ancora APERTI (condizione non
    // rientrata), non quanti sono „da leggere": la lettura è personale, il
    // cruscotto descrive lo stato del magazzino.
    prisma.notification.count({ where: { resolvedAt: null } }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        qty: true,
        createdAt: true,
        product: { select: { sku: true, name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  let giacenzaTotale = 0;
  let sottoScorta = 0;
  let esauriti = 0;
  let valorizzazioneCents = 0;
  for (const p of prodotti) {
    const qty = giacenzaDi(giacenze, p.id).qty;
    giacenzaTotale += qty;
    if (qty <= 0) esauriti += 1;
    else if (qty <= p.minStock) sottoScorta += 1;
    if (vedeCosti) valorizzazioneCents += qty * (costi.get(p.id) ?? p.costCents);
  }

  const [vendite, venditePrec, acquisti, acquistiPrec] = await Promise.all([
    // Il cruscotto non mostra il margine: i costi delle vendite non si leggono.
    vedeVendite ? datiVendite(mese, { conCosti: false }) : null,
    vedeVendite ? datiVendite(mesePrecedente, { conCosti: false }) : null,
    datiAcquisti(mese),
    datiAcquisti(mesePrecedente),
  ]);

  return {
    giacenzaTotale,
    prodottiAttivi: prodotti.length,
    sottoScorta,
    esauriti,
    valorizzazioneCents: vedeCosti ? valorizzazioneCents : null,
    acquistiAperti,
    venditeAperte,
    merceInArrivo: [...arrivo.values()].reduce((a, b) => a + b, 0),
    spedizioniPronte,
    notificheAperte,
    venditeMese: {
      fatturatoCents: vendite?.fatturatoCents ?? 0,
      ordini: vendite?.numeroOrdini ?? 0,
    },
    venditeMesePrecedente: {
      fatturatoCents: venditePrec?.fatturatoCents ?? 0,
      ordini: venditePrec?.numeroOrdini ?? 0,
    },
    acquistiMese: { spesaCents: acquisti.spesaCents, ordini: acquisti.numeroOrdini },
    acquistiMesePrecedente: {
      spesaCents: acquistiPrec.spesaCents,
      ordini: acquistiPrec.numeroOrdini,
    },
    piuVenduti: (vendite?.perProdotto ?? []).slice(0, 5),
    ultimiMovimenti: ultimi.map((m) => ({
      id: m.id,
      tipo: m.type,
      qty: m.qty,
      createdAt: m.createdAt,
      sku: m.product.sku,
      nome: m.product.name,
      utente: m.user?.name ?? null,
    })),
  };
}

/** Tipi d'uscita usati dai report — esportati per la documentazione a schermo. */
export const CAUSALI_USCITA = TIPI_USCITA;
