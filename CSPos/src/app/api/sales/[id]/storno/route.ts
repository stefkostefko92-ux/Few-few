// Сторно по чл. 31 от Наредба Н-18: три допустими причини, сторно бон от ФУ с УНП на
// сторнираната продажба (Прил. № 29, т. 10), препратка към оригиналния бон.
// Стоката се връща в склада при операторска грешка и връщане/рекламация.
// Правата: управител или администратор.
//
// Ред (т. 2): резервация → сторно бон → запис → връщане по картата.
// • Резервацията е уникален ред, създаден ПРЕДИ печата: повторна/паралелна заявка получава
//   409, без втори сторно бон и без второ връщане на пари.
// • Връщането по картата е СЛЕД записа: провален запис не оставя върнати пари без следа.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { fiscalNow } from "@/lib/fiscal/link";
import { getTerminalDriver } from "@/lib/terminal";
import { nextSaleNumber } from "@/lib/counters";
import { eurCentsToBgnCents } from "@/lib/money";
import { toFiscalItem } from "@/lib/pricing";
import { getSetting, isDualDisplayActive } from "@/lib/settings";
import { UNITS, type StornoReasonKey } from "@/lib/constants";

const schema = z.object({
  reason: z.enum(["OPERATOR_ERROR", "RETURN", "TAX_BASE_CUT"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидна причина за сторно.");
    const reason = parsed.data.reason as StornoReasonKey;

    const original = await prisma.sale.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, stornoBy: true },
    });
    if (!original) throw jsonError(404, "Продажбата не е намерена.");
    if (original.status === "STORNO") throw jsonError(409, "Това вече е сторно документ.");
    if (original.stornoBy) throw jsonError(409, "Продажбата вече е сторнирана.");

    // срокът за операторска грешка: до 7-о число на следващия месец (чл. 31 Н-18)
    if (reason === "OPERATOR_ERROR") {
      const saleDate = new Date(original.createdAt);
      const deadline = new Date(saleDate.getFullYear(), saleDate.getMonth() + 1, 7, 23, 59, 59);
      if (new Date() > deadline) {
        throw jsonError(409, "Срокът за сторно при операторска грешка е изтекъл (до 7-о число на следващия месец).");
      }
    }

    const shift = await prisma.shift.findFirst({ where: { userId: s.userId, closedAt: null } });
    if (!shift) throw jsonError(409, "Няма отворена смяна.");

    // резервация преди печата — Setting.key е първичен ключ, второто създаване пада с P2002
    const lockKey = `stornoLock:${original.id}`;
    try {
      await prisma.setting.create({
        data: { key: lockKey, value: JSON.stringify({ by: s.userId, at: new Date().toISOString(), state: "PRINTING" }) },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw jsonError(409, "Сторното на тази продажба вече е в ход или е направено.");
      }
      throw e;
    }

    const fiscalCfg = await getSetting("fiscal");
    // при намаление на данъчната основа реално НЕ излизат пари от касата
    const noCashMove = reason === "TAX_BASE_CUT";
    const stornoCashCents = noCashMove ? 0 : original.cashCents;
    const stornoCardCents = noCashMove ? 0 : original.cardCents;

    const fiscal = await getFiscalDriver();
    const receipt = await fiscal.printStorno({
      // УНП е номер на ПРОДАЖБАТА: сторно бонът носи УНП на сторнираната (т. 10)
      unp: fiscalCfg.suptoMode ? original.unp : null,
      operatorCode: s.operatorCode,
      operatorName: s.name,
      // същото представяне като при продажбата: заключена цена 1 × сума, MxN — отстъпка в сума
      items: original.items.map((it) =>
        toFiscalItem(
          {
            product: { ...it.product, name: it.nameSnapshot, vatGroup: it.vatGroup },
            qtyMilli: it.qtyMilli,
            lockedCents: it.priceLockedCents,
            unitCents: it.unitPriceCents,
            catalogCents: it.totalCents,
            discountPermille: it.discountPermille,
            discountCents: it.discountCents,
            totalCents: it.totalCents,
            vatRatePermille: it.vatRatePermille,
            vatCents: it.vatCents,
            promotionId: null,
          },
          UNITS[it.product.unit as keyof typeof UNITS]?.label ?? "бр."
        )
      ),
      payments: [
        ...(stornoCashCents > 0 ? [{ type: "CASH" as const, amountCents: stornoCashCents }] : []),
        ...(stornoCardCents > 0 ? [{ type: "CARD" as const, amountCents: stornoCardCents }] : []),
      ],
      totalCents: original.totalCents,
      changeCents: 0,
      dualDisplay: await isDualDisplayActive(),
      reason,
      originalReceiptNo: original.fiscalReceiptNo ?? String(original.number),
      originalReceiptDate: original.createdAt.toISOString(),
    });
    if (!receipt.ok) {
      // нищо не е отпечатано — резервацията се освобождава, може да се опита отново
      await prisma.setting.delete({ where: { key: lockKey } }).catch(() => undefined);
      await audit(s.userId, "STORNO_FISCAL_FAILED", "Sale", id, { error: receipt.error }, { unp: original.unp });
      throw jsonError(502, receipt.error ?? "Фискалното устройство отказа сторно бона.");
    }

    const returnStock = reason !== "TAX_BASE_CUT";
    const at = await fiscalNow();
    const number = await nextSaleNumber();
    const storno = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          // УНП е на продажбата; редът на сторно документа пази препратка, не нов УНП (т. 9)
          unp: `СТОРНО-${original.unp}`,
          number,
          status: "STORNO",
          shiftId: shift.id,
          userId: s.userId,
          customerId: original.customerId,
          storeCode: original.storeCode,
          workplaceCode: original.workplaceCode,
          openedAt: at,
          subtotalCents: original.subtotalCents,
          discountCents: original.discountCents,
          totalCents: original.totalCents,
          totalBgnCents: eurCentsToBgnCents(original.totalCents),
          paymentType: original.paymentType,
          cashCents: stornoCashCents,
          cardCents: stornoCardCents,
          terminalRef: original.terminalRef,
          fiscalReceiptNo: receipt.receiptNumber ?? null,
          fiscalDeviceSn: receipt.deviceSerial ?? original.fiscalDeviceSn ?? fiscalCfg.deviceSerial,
          stornoOfId: original.id,
          stornoReason: reason,
          createdAt: at,
          items: {
            create: original.items.map((it) => ({
              productId: it.productId,
              pluSnapshot: it.pluSnapshot || it.product.plu,
              nameSnapshot: it.nameSnapshot,
              unitPriceCents: it.unitPriceCents,
              qtyMilli: it.qtyMilli,
              vatGroup: it.vatGroup,
              vatRatePermille: it.vatRatePermille,
              discountPermille: it.discountPermille,
              discountCents: it.discountCents,
              priceLockedCents: it.priceLockedCents,
              totalCents: it.totalCents,
              vatCents: it.vatCents,
            })),
          },
        },
      });
      if (original.paymentType === "CREDIT" && original.customerId) {
        await tx.customer.update({
          where: { id: original.customerId },
          data: { balanceCents: { decrement: original.totalCents } },
        });
      }
      if (returnStock) {
        for (const it of original.items) {
          await tx.product.update({ where: { id: it.productId }, data: { stockMilli: { increment: it.qtyMilli } } });
          await tx.stockMovement.create({
            data: { productId: it.productId, type: "STORNO", qtyMilliDelta: it.qtyMilli, refId: created.id },
          });
        }
      }
      await tx.setting.update({
        where: { key: lockKey },
        data: { value: JSON.stringify({ by: s.userId, at: at.toISOString(), state: "DONE", stornoId: created.id }) },
      });
      return created;
    });

    await audit(
      s.userId,
      "STORNO",
      "Sale",
      storno.id,
      { originalId: original.id, reason, totalCents: original.totalCents, fiscalReceiptNo: receipt.receiptNumber },
      { unp: original.unp }
    );

    // връщане по картата — СЛЕД записа (не при намаление на основата)
    let cardRefunded = false;
    if (!noCashMove && original.cardCents > 0 && original.terminalRef) {
      const terminal = await getTerminalDriver();
      const refund = await terminal?.refund(original.cardCents, original.terminalRef).catch(() => null);
      cardRefunded = !!refund?.ok;
      if (!cardRefunded) {
        await audit(
          s.userId,
          "STORNO_CARD_REFUND_FAILED",
          "Sale",
          storno.id,
          { cardCents: original.cardCents, terminalRef: original.terminalRef },
          { unp: original.unp }
        );
      }
    }

    return Response.json(
      {
        storno,
        receiptText: receipt.receiptText ?? null,
        cardRefundManual: !noCashMove && original.cardCents > 0 && !cardRefunded,
      },
      { status: 201 }
    );
  });
}
