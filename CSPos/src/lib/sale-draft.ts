// Открита продажба в базата (Прил. № 29, т. 9, 9.1, 12; т. 2 — пълнота).
//
// • Откриване: УНП с пореден № от отделен брояч за ИН на ФУ — в една транзакция с записа,
//   иначе отказ след инкремента би оставил дупка в номерацията.
// • Синхронизация: екранът праща пълния списък редове; сървърът сравнява с записания и
//   записва всяко намаление/премахване като анулиране със сървърна стойност.
// • Плащане: OPEN → PAYING е атомарен UPDATE с условие — второ плащане получава 0 реда.

import { prisma } from "./db";
import { jsonError } from "./auth";
import { audit } from "./audit";
import { buildUnp } from "./unp";
import { diffCancellations } from "./draft";
import { lineDiscountCents, priceLine, type PricedLine, type PricingContext, type ProductLike } from "./pricing";
import { fetchActivePromotions } from "./promotions-db";
import { getSetting, getVatRates } from "./settings";
import type { RoleKey } from "./constants";

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
}

export async function pricingContext(customerCard: string | null | undefined, now = new Date()): Promise<{
  ctx: PricingContext;
  customer: { id: string; discountPermille: number; balanceCents: number; creditLimitCents: number; name: string } | null;
}> {
  const customer = customerCard
    ? await prisma.customer.findUnique({ where: { cardNumber: customerCard } })
    : null;
  if (customerCard && (!customer || !customer.active)) throw jsonError(404, "Клиентската карта не е намерена.");
  const [vatRates, promos] = await Promise.all([getVatRates(), fetchActivePromotions(now)]);
  return {
    ctx: { promos, now, customerDiscountPermille: customer?.discountPermille ?? 0, vatRates },
    customer,
  };
}

export async function priceLines(lines: SyncLine[], ctx: PricingContext): Promise<PricedLine[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p as ProductLike & { active: boolean }]));
  return lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p || !p.active) throw jsonError(404, "Стока от бона не е намерена или е деактивирана.");
    return priceLine(l, p, ctx);
  });
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

type DraftLineRow = { uid: string; productId: string; qtyMilli: number; discountPermille: number; priceLockedCents: number | null };

async function recordCancellations(
  draft: { id: string; unp: string; openedAt: Date },
  op: Pick<Operator, "userId" | "operatorCode">,
  cancelled: Array<{ line: DraftLineRow; qtyMilli: number }>,
  kind: "LINE" | "FULL",
  ctx: PricingContext,
  at: Date
): Promise<void> {
  if (cancelled.length === 0) return;
  const priced = await priceLines(
    cancelled.map((c) => ({
      uid: c.line.uid,
      productId: c.line.productId,
      qtyMilli: c.qtyMilli,
      discountPermille: c.line.discountPermille,
      priceLockedCents: c.line.priceLockedCents,
    })),
    ctx
  );
  await prisma.cancelledItem.createMany({
    data: priced.map((p) => ({
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
    })),
  });
  for (const p of priced) {
    await audit(
      op.userId,
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
  // цените на новото състояние се проверяват ПРЕДИ записа (несъществуваща стока → 404)
  const priced = await priceLines(lines, ctx);

  const prevByUid = new Map(draft.lines.map((l) => [l.uid, l]));
  const cancelled = diffCancellations(draft.lines, lines).map((c) => ({
    line: prevByUid.get(c.uid)!,
    qtyMilli: c.qtyMilli,
  }));
  const keep = new Set(lines.map((l) => l.uid));

  await prisma.$transaction(async (tx) => {
    await tx.saleDraftLine.deleteMany({ where: { draftId, uid: { notIn: [...keep] } } });
    for (const [position, l] of lines.entries()) {
      const data = {
        position,
        productId: l.productId,
        qtyMilli: l.qtyMilli,
        discountPermille: l.discountPermille,
        priceLockedCents: l.priceLockedCents ?? null,
      };
      await tx.saleDraftLine.upsert({
        where: { draftId_uid: { draftId, uid: l.uid } },
        create: { draftId, uid: l.uid, ...data },
        update: data,
      });
    }
    if (customerCard !== draft.customerCard) {
      await tx.saleDraft.update({ where: { id: draftId }, data: { customerCard: customerCard ?? null } });
    }
  });
  await recordCancellations(draft, op, cancelled, "LINE", ctx, new Date());

  return { draft: { id: draft.id, unp: draft.unp, openedAt: draft.openedAt }, priced };
}

/** Пълно анулиране на откритата продажба („Изчисти“): всичко остава в базата. */
export async function cancelDraft(draftId: string, op: Pick<Operator, "userId" | "operatorCode">) {
  const draft = await ownDraft(draftId, op.userId, ["OPEN", "HELD"]);
  const { ctx } = await pricingContext(draft.customerCard).catch(() => pricingContext(null));
  const changed = await prisma.saleDraft.updateMany({
    where: { id: draftId, state: { in: ["OPEN", "HELD"] } },
    data: { state: "CANCELLED", closedAt: new Date() },
  });
  if (changed.count === 0) throw jsonError(409, "Продажбата вече не е открита.");
  await recordCancellations(
    draft,
    op,
    draft.lines.map((l) => ({ line: l, qtyMilli: l.qtyMilli })),
    "FULL",
    ctx,
    new Date()
  );
  await audit(op.userId, "SALE_ANNULLED", "SaleDraft", draft.id, { lines: draft.lines.length }, { unp: draft.unp });
}

/** OPEN → PAYING атомарно; false = вече се плаща/приключена (второ натискане, втора каса). */
export async function lockDraftForPayment(draftId: string, userId: string): Promise<boolean> {
  const r = await prisma.saleDraft.updateMany({
    where: { id: draftId, userId, state: "OPEN" },
    data: { state: "PAYING" },
  });
  return r.count === 1;
}

/** Връщане в OPEN след отказ на ФУ/терминала (продажбата не е приключила). */
export async function releaseDraft(draftId: string): Promise<void> {
  await prisma.saleDraft.updateMany({ where: { id: draftId, state: "PAYING" }, data: { state: "OPEN" } });
}

export async function holdDraft(draftId: string, op: Pick<Operator, "userId">): Promise<void> {
  await ownDraft(draftId, op.userId);
  await prisma.saleDraft.update({ where: { id: draftId }, data: { state: "HELD", heldAt: new Date() } });
}

export async function resumeDraft(draftId: string, op: Pick<Operator, "userId">) {
  await ownDraft(draftId, op.userId, ["HELD"]);
  return prisma.saleDraft.update({
    where: { id: draftId },
    data: { state: "OPEN", heldAt: null },
    include: { lines: { orderBy: { position: "asc" } } },
  });
}

/** Откритите и задържаните продажби на оператора (след презареждане екранът ги възстановява). */
export function listDrafts(userId: string) {
  return prisma.saleDraft.findMany({
    where: { userId, state: { in: ["OPEN", "HELD", "PAYING"] } },
    include: { lines: { orderBy: { position: "asc" } } },
    orderBy: { openedAt: "asc" },
  });
}
