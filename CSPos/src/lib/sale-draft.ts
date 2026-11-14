// Открита продажба в базата (Прил. № 29, т. 9, 9.1, 12; т. 2 — пълнота).
//
// • Откриване: УНП с пореден № от отделен брояч за ИН на ФУ — в една транзакция с записа,
//   иначе отказ след инкремента би оставил дупка в номерацията.
// • Синхронизация: екранът праща пълния списък редове; сървърът сравнява с записания и
//   записва всяко намаление/премахване като анулиране със сървърна стойност — в СЪЩАТА
//   транзакция с промяната на редовете (иначе провал по средата губи следата).
// • Всеки преход на състоянието е условен UPDATE (очакваното състояние е в where):
//   проверка-после-запис би позволил задържане по време на плащане и втори бон.
// • Заключена цена (ценови баркод, свободна продажба) не се приема на доверие: сървърът я
//   изважда от баркода или я допуска само за служебен PLU.

import { prisma } from "./db";
import { jsonError } from "./auth";
import { audit } from "./audit";
import { buildUnp } from "./unp";
import { diffCancellations } from "./draft";
import { parseEmbeddedBarcode } from "./barcode";
import { lineDiscountCents, priceLine, type PricedLine, type PricingContext, type ProductLike } from "./pricing";
import { fetchActivePromotions } from "./promotions-db";
import { getBarcodeMasks, getSetting, getVatRates } from "./settings";
import { SERVICE_PLU_MIN, type RoleKey } from "./constants";

export interface Operator {
  userId: string;
  operatorCode: number;
  role: RoleKey;
  shiftId: string;
}

export interface SyncLine {
  uid: string;
  productId: string;
  qtyMilli: number;
  discountPermille: number;
  priceLockedCents?: number | null;
  /** Ценовият баркод, от който идва заключената цена. */
  lockBarcode?: string | null;
}

/** Намерение за плащане — пази се при заключването, за да може прекъснато плащане да се свери. */
export interface PaymentIntent {
  type: "CASH" | "CARD" | "MIXED" | "CREDIT";
  paidCashDue: number;
  paidCard: number;
  change: number;
  totalCents: number;
}

export async function pricingContext(customerCard: string | null | undefined, now = new Date(), opts: { lenient?: boolean } = {}): Promise<{
  ctx: PricingContext;
  customer: { id: string; discountPermille: number; balanceCents: number; creditLimitCents: number; name: string } | null;
}> {
  const found = customerCard ? await prisma.customer.findUnique({ where: { cardNumber: customerCard } }) : null;
  if (customerCard && (!found || !found.active) && !opts.lenient) throw jsonError(404, "Клиентската карта не е намерена.");
  const customer = found && (found.active || opts.lenient) ? found : null;
  const [vatRates, promos] = await Promise.all([getVatRates(), fetchActivePromotions(now)]);
  return {
    ctx: { promos, now, customerDiscountPermille: customer?.discountPermille ?? 0, vatRates },
    customer,
  };
}

/**
 * Остойностява редове на сървъра. `allowInactive` — за анулиране и сверка: стока,
 * деактивирана междувременно, пак трябва да остави следа със стойност.
 */
export async function priceLines(
  lines: SyncLine[],
  ctx: PricingContext,
  opts: { allowInactive?: boolean } = {}
): Promise<PricedLine[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p as ProductLike & { active: boolean }]));
  return lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p || (!p.active && !opts.allowInactive)) throw jsonError(404, "Стока от бона не е намерена или е деактивирана.");
    return priceLine(l, p, ctx);
  });
}

/**
 * Заключена цена се приема само ако (1) стоката е служебна (свободна продажба, PLU ≥ 990)
 * или (2) идва от валиден ценови баркод на СЪЩАТА стока със СЪЩАТА сума.
 */
export async function assertLocks(lines: SyncLine[]): Promise<void> {
  const locked = lines.filter((l) => l.priceLockedCents !== undefined && l.priceLockedCents !== null);
  if (locked.length === 0) return;
  const [products, masks] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: locked.map((l) => l.productId) } }, select: { id: true, plu: true } }),
    getBarcodeMasks(),
  ]);
  const pluOf = new Map(products.map((p) => [p.id, p.plu]));
  for (const l of locked) {
    const plu = pluOf.get(l.productId);
    if (plu === undefined) throw jsonError(404, "Стока от бона не е намерена.");
    if (plu >= SERVICE_PLU_MIN) continue;
    const parsed = l.lockBarcode ? parseEmbeddedBarcode(l.lockBarcode, masks) : null;
    if (!parsed || parsed.kind !== "price" || parsed.plu !== plu || parsed.value !== l.priceLockedCents) {
      throw jsonError(400, "Ръчна цена се приема само от ценови баркод на стоката или при свободна продажба.");
    }
  }
}

/** Атомарен пореден № за УНП — отделен за всеки ИН на ФУ (т. 9). */
async function nextUnpSeq(tx: Pick<typeof prisma, "$queryRawUnsafe">, serial: string): Promise<number> {
  const key = `unpSeq:${serial}`;
  const rows = await tx.$queryRawUnsafe<Array<{ value: string }>>(
    `INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (?, '1', CURRENT_TIMESTAMP)
     ON CONFLICT("key") DO UPDATE SET "value" = CAST(CAST("value" AS INTEGER) + 1 AS TEXT), "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "value"`,
    key
  );
  return Number(rows[0]!.value);
}

export async function openDraft(op: Operator, fiscalSerial: string, at = new Date()) {
  const [store, workplace] = await Promise.all([getSetting("store"), getSetting("workplace")]);
  return prisma.$transaction(async (tx) => {
    const seq = await nextUnpSeq(tx, fiscalSerial);
    return tx.saleDraft.create({
      data: {
        unp: buildUnp(fiscalSerial, op.operatorCode, seq),
        unpSeq: seq,
        fiscalSerial,
        userId: op.userId,
        operatorCode: op.operatorCode,
        shiftId: op.shiftId,
        storeCode: store.code,
        workplaceCode: workplace.code,
        openedAt: at,
      },
    });
  });
}

async function ownDraft(draftId: string, userId: string, states: string[] = ["OPEN"]) {
  const d = await prisma.saleDraft.findUnique({ where: { id: draftId }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!d) throw jsonError(404, "Откритата продажба не е намерена.");
  if (d.userId !== userId) throw jsonError(403, "Продажбата е открита от друг оператор.");
  if (!states.includes(d.state)) throw jsonError(409, "Продажбата вече не е открита.");
  return d;
}

type DraftLineRow = {
  uid: string;
  productId: string;
  qtyMilli: number;
  discountPermille: number;
  priceLockedCents: number | null;
};

async function priceCancellations(
  cancelled: Array<{ line: DraftLineRow; qtyMilli: number }>,
  ctx: PricingContext
): Promise<PricedLine[]> {
  if (cancelled.length === 0) return [];
  return priceLines(
    cancelled.map((c) => ({
      uid: c.line.uid,
      productId: c.line.productId,
      qtyMilli: c.qtyMilli,
      discountPermille: c.line.discountPermille,
      priceLockedCents: c.line.priceLockedCents,
    })),
    ctx,
    { allowInactive: true }
  );
}

function cancelledRows(
  draft: { id: string; unp: string; openedAt: Date },
  op: Pick<Operator, "userId" | "operatorCode">,
  priced: PricedLine[],
  kind: "LINE" | "FULL",
  at: Date
) {
  return priced.map((p) => ({
    draftId: draft.id,
    unp: draft.unp,
    productId: p.product.id,
    plu: p.product.plu,
    name: p.product.name,
    qtyMilli: p.qtyMilli,
    unitPriceCents: p.unitCents,
    discountCents: lineDiscountCents(p),
    vatGroup: p.product.vatGroup,
    vatRatePermille: p.vatRatePermille,
    vatCents: p.vatCents,
    totalCents: p.totalCents,
    kind,
    userId: op.userId,
    operatorCode: op.operatorCode,
    openedAt: draft.openedAt,
    cancelledAt: at,
  }));
}

async function auditCancellations(
  draft: { id: string; unp: string },
  userId: string,
  priced: PricedLine[],
  kind: "LINE" | "FULL"
): Promise<void> {
  for (const p of priced) {
    await audit(
      userId,
      kind === "FULL" ? "SALE_ANNULLED_ITEM" : "SALE_ITEM_ANNULLED",
      "SaleDraft",
      draft.id,
      { plu: p.product.plu, name: p.product.name, qtyMilli: p.qtyMilli, totalCents: p.totalCents },
      { unp: draft.unp }
    );
  }
}

/** Записва текущите редове на екрана; намаленията/премахванията стават анулирания (т. 12). */
export async function syncDraft(
  draftId: string,
  op: Operator,
  lines: SyncLine[],
  opts: { customerCard?: string | null } = {}
) {
  const draft = await ownDraft(draftId, op.userId);
  const customerCard = opts.customerCard === undefined ? draft.customerCard : opts.customerCard;
  const { ctx } = await pricingContext(customerCard);
  // новото състояние се проверява ПРЕДИ записа: несъществуваща стока → 404, чужда цена → 400
  await assertLocks(lines);
  const priced = await priceLines(lines, ctx);

  const prevByUid = new Map(draft.lines.map((l) => [l.uid, l]));
  // смяна на заключената цена на същия ред = анулиране на стария ред (цената не се „сваля“ тихо)
  const relocked = new Set(
    lines
      .filter((l) => {
        const prev = prevByUid.get(l.uid);
        return prev && prev.productId === l.productId && (prev.priceLockedCents ?? null) !== (l.priceLockedCents ?? null);
      })
      .map((l) => l.uid)
  );
  const cancelled = [
    ...diffCancellations(
      draft.lines.filter((l) => !relocked.has(l.uid)),
      lines
    ).map((c) => ({ line: prevByUid.get(c.uid)!, qtyMilli: c.qtyMilli })),
    ...[...relocked].map((uid) => ({ line: prevByUid.get(uid)!, qtyMilli: prevByUid.get(uid)!.qtyMilli })),
  ];
  const discountChanges = lines
    .map((l) => ({ l, prev: prevByUid.get(l.uid) }))
    .filter(({ l, prev }) => prev && prev.discountPermille !== l.discountPermille)
    .map(({ l, prev }) => ({ uid: l.uid, from: prev!.discountPermille, to: l.discountPermille }));
  const cancelledPriced = await priceCancellations(cancelled, ctx);
  const keep = new Set(lines.map((l) => l.uid));
  const at = new Date();

  await prisma.$transaction(async (tx) => {
    // условие за състоянието в самия запис: задържана/плащана междувременно продажба не се пипа
    const own = await tx.saleDraft.updateMany({
      where: { id: draftId, userId: op.userId, state: "OPEN" },
      data: { customerCard: customerCard ?? null },
    });
    if (own.count !== 1) throw jsonError(409, "Продажбата вече не е открита.");
    await tx.saleDraftLine.deleteMany({ where: { draftId, uid: { notIn: [...keep] } } });
    for (const [position, l] of lines.entries()) {
      const data = {
        position,
        productId: l.productId,
        qtyMilli: l.qtyMilli,
        discountPermille: l.discountPermille,
        priceLockedCents: l.priceLockedCents ?? null,
        lockBarcode: l.priceLockedCents !== undefined && l.priceLockedCents !== null ? l.lockBarcode ?? null : null,
      };
      await tx.saleDraftLine.upsert({
        where: { draftId_uid: { draftId, uid: l.uid } },
        create: { draftId, uid: l.uid, ...data },
        update: data,
      });
    }
    if (cancelledPriced.length > 0) {
      await tx.cancelledItem.createMany({ data: cancelledRows(draft, op, cancelledPriced, "LINE", at) });
    }
  });
  await auditCancellations(draft, op.userId, cancelledPriced, "LINE");
  if (discountChanges.length > 0) {
    await audit(op.userId, "SALE_DISCOUNT_CHANGED", "SaleDraft", draft.id, { changes: discountChanges }, { unp: draft.unp });
  }

  return { draft: { id: draft.id, unp: draft.unp, openedAt: draft.openedAt }, priced };
}

/** Пълно анулиране на откритата продажба („Анулирай“): всичко остава в базата. */
export async function cancelDraft(draftId: string, op: Pick<Operator, "userId" | "operatorCode">) {
  const draft = await ownDraft(draftId, op.userId, ["OPEN", "HELD"]);
  const { ctx } = await pricingContext(draft.customerCard, new Date(), { lenient: true });
  const priced = await priceCancellations(
    draft.lines.map((l) => ({ line: l, qtyMilli: l.qtyMilli })),
    ctx
  );
  const at = new Date();
  await prisma.$transaction(async (tx) => {
    const changed = await tx.saleDraft.updateMany({
      where: { id: draftId, userId: op.userId, state: { in: ["OPEN", "HELD"] } },
      data: { state: "CANCELLED", closedAt: at },
    });
    if (changed.count !== 1) throw jsonError(409, "Продажбата вече не е открита.");
    if (priced.length > 0) await tx.cancelledItem.createMany({ data: cancelledRows(draft, op, priced, "FULL", at) });
  });
  await auditCancellations(draft, op.userId, priced, "FULL");
  await audit(op.userId, "SALE_ANNULLED", "SaleDraft", draft.id, { lines: draft.lines.length }, { unp: draft.unp });
}

/** OPEN → PAYING атомарно; false = вече се плаща/приключена (второ натискане, втора каса). */
export async function lockDraftForPayment(draftId: string, userId: string, intent?: PaymentIntent): Promise<boolean> {
  const r = await prisma.saleDraft.updateMany({
    where: { id: draftId, userId, state: "OPEN" },
    data: {
      state: "PAYING",
      payingAt: new Date(),
      paymentJson: intent ? JSON.stringify(intent) : null,
      fiscalReceiptNo: null,
      fiscalDeviceSn: null,
      terminalRef: null,
    },
  });
  return r.count === 1;
}

/** Терминалът одобри картата — референцията се пази веднага (за връщане при сверка). */
export async function markCardCharged(draftId: string, terminalRef: string | null): Promise<void> {
  await prisma.saleDraft.updateMany({ where: { id: draftId, state: "PAYING" }, data: { terminalRef } });
}

/** ФУ издаде бона — номерът се пази веднага, преди записа на продажбата. */
export async function markPrinted(draftId: string, receiptNo: string | null, deviceSn: string | null): Promise<void> {
  await prisma.saleDraft.updateMany({
    where: { id: draftId, state: "PAYING" },
    data: { fiscalReceiptNo: receiptNo ?? "(без номер)", fiscalDeviceSn: deviceSn },
  });
}

/** Бонът е издаден, записът не успя: продажбата чака сверка от управител. */
export async function markReconcile(draftId: string): Promise<void> {
  await prisma.saleDraft.updateMany({ where: { id: draftId, state: "PAYING" }, data: { state: "RECONCILE" } });
}

/** Връщане в OPEN след отказ на ФУ/терминала (продажбата не е приключила, бон няма). */
export async function releaseDraft(draftId: string): Promise<void> {
  await prisma.saleDraft.updateMany({
    where: { id: draftId, state: "PAYING", fiscalReceiptNo: null },
    data: { state: "OPEN", payingAt: null, paymentJson: null, terminalRef: null },
  });
}

export async function holdDraft(draftId: string, op: Pick<Operator, "userId">): Promise<void> {
  const r = await prisma.saleDraft.updateMany({
    where: { id: draftId, userId: op.userId, state: "OPEN" },
    data: { state: "HELD", heldAt: new Date() },
  });
  if (r.count !== 1) throw jsonError(409, "Само открита продажба може да бъде задържана.");
}

export async function resumeDraft(draftId: string, op: Pick<Operator, "userId">) {
  const r = await prisma.saleDraft.updateMany({
    where: { id: draftId, userId: op.userId, state: "HELD" },
    data: { state: "OPEN", heldAt: null },
  });
  if (r.count !== 1) throw jsonError(409, "Продажбата не е задържана.");
  return prisma.saleDraft.findUniqueOrThrow({
    where: { id: draftId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
}

/** Откритите и задържаните продажби на оператора (след презареждане екранът ги възстановява). */
export function listDrafts(userId: string) {
  return prisma.saleDraft.findMany({
    where: { userId, state: { in: ["OPEN", "HELD", "PAYING", "RECONCILE"] } },
    include: { lines: { orderBy: { position: "asc" } } },
    orderBy: { openedAt: "asc" },
  });
}
