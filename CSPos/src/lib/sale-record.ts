// Записът на приключена продажба — един път за плащането и за сверката на прекъснато
// плащане (Прил. № 29, т. 2). Продажба, склад, вересия и приключване на откритата продажба
// са в ЕДНА транзакция; състоянието на откритата продажба е условие в самия запис.

import { prisma } from "./db";
import { eurCentsToBgnCents } from "./money";
import { nextSaleNumber } from "./counters";
import type { PricedLine } from "./pricing";
import type { PaymentIntent } from "./sale-draft";

export interface RecordSaleInput {
  draft: {
    id: string;
    unp: string;
    openedAt: Date;
    storeCode: string;
    workplaceCode: string;
    userId: string;
    shiftId: string;
  };
  lines: PricedLine[];
  customerId: string | null;
  payment: PaymentIntent;
  receipt: { receiptNumber: string | null; deviceSerial: string | null };
  terminalRef: string | null;
  closedAt: Date;
  /** От кое състояние се приключва (PAYING при плащане, PAYING/RECONCILE при сверка). */
  fromStates: string[];
}

export async function recordSale(input: RecordSaleInput) {
  const { draft, lines, payment } = input;
  const subtotal = lines.reduce((a, l) => a + l.catalogCents, 0);
  const total = lines.reduce((a, l) => a + l.totalCents, 0);
  const number = await nextSaleNumber();

  return prisma.$transaction(async (tx) => {
    const closed = await tx.saleDraft.updateMany({
      where: { id: draft.id, state: { in: input.fromStates } },
      data: { state: "COMPLETED", closedAt: input.closedAt },
    });
    if (closed.count !== 1) throw new Error("Откритата продажба смени състоянието си по време на плащането.");

    const created = await tx.sale.create({
      data: {
        unp: draft.unp,
        number,
        draftId: draft.id,
        openedAt: draft.openedAt,
        storeCode: draft.storeCode,
        workplaceCode: draft.workplaceCode,
        shiftId: draft.shiftId,
        userId: draft.userId,
        customerId: input.customerId,
        subtotalCents: subtotal,
        discountCents: subtotal - total,
        totalCents: total,
        totalBgnCents: eurCentsToBgnCents(total),
        paymentType: payment.type,
        cashCents: payment.paidCashDue,
        cardCents: payment.paidCard,
        changeCents: payment.change,
        fiscalReceiptNo: input.receipt.receiptNumber,
        fiscalDeviceSn: input.receipt.deviceSerial,
        terminalRef: input.terminalRef,
        createdAt: input.closedAt,
        items: {
          create: lines.map((l) => ({
            productId: l.product.id,
            pluSnapshot: l.product.plu,
            nameSnapshot: l.product.name,
            unitPriceCents: l.unitCents,
            qtyMilli: l.qtyMilli,
            vatGroup: l.product.vatGroup,
            vatRatePermille: l.vatRatePermille,
            discountPermille: l.discountPermille,
            discountCents: l.discountCents,
            priceLockedCents: l.lockedCents,
            totalCents: l.totalCents,
            vatCents: l.vatCents,
          })),
        },
      },
      include: { items: true },
    });
    if (payment.type === "CREDIT" && input.customerId) {
      await tx.customer.update({ where: { id: input.customerId }, data: { balanceCents: { increment: total } } });
    }
    for (const l of lines) {
      await tx.product.update({ where: { id: l.product.id }, data: { stockMilli: { decrement: l.qtyMilli } } });
      await tx.stockMovement.create({
        data: { productId: l.product.id, type: "SALE", qtyMilliDelta: -l.qtyMilli, refId: created.id },
      });
    }
    return created;
  });
}
