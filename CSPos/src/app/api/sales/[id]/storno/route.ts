// Сторно по чл. 31 от Наредба Н-18: три допустими причини, сторно бон от ФУ,
// препратка към оригиналния бон. Стоката се връща в склада при
// операторска грешка и връщане/рекламация (не при намаление на основата).
// Правата: управител или администратор.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { getTerminalDriver } from "@/lib/terminal";
import { buildUnp } from "@/lib/unp";
import { nextSaleNumber } from "@/lib/counters";
import { eurCentsToBgnCents } from "@/lib/money";
import { getSetting, isDualDisplayActive } from "@/lib/settings";
import { UNITS, type StornoReasonKey, type VatGroupKey } from "@/lib/constants";

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
        throw jsonError(
          409,
          "Срокът за сторно при операторска грешка е изтекъл (до 7-о число на следващия месец)."
        );
      }
    }

    const shift = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
    });
    if (!shift) throw jsonError(409, "Няма отворена смяна.");

    const fiscalCfg = await getSetting("fiscal");
    // атомарен пореден номер (както при продажбата) — без дублиран номер/УНП
    const number = await nextSaleNumber();
    const unp = buildUnp(fiscalCfg.deviceSerial, s.operatorCode, number);

    // при намаление на данъчната основа реално НЕ излизат пари от касата
    const noCashMove = reason === "TAX_BASE_CUT";
    const stornoCashCents = noCashMove ? 0 : original.cashCents;
    const stornoCardCents = noCashMove ? 0 : original.cardCents;

    const fiscal = await getFiscalDriver();
    const receipt = await fiscal.printStorno({
      // Н-18 чл. 31, ал. 2, изр. 3 + Прил. № 29, т. 10: УНП е номер на ПРОДАЖБАТА, не на документа —
      // сторно бонът носи УНП на продажбата, ПО КОЯТО се сторнира, а не свой собствен.
      // (`unp` по-долу остава за реда в базата, където полето е @unique.)
      unp: fiscalCfg.suptoMode ? original.unp : null,
      operatorCode: s.operatorCode,
      operatorName: s.name,
      items: original.items.map((it) => ({
        name: it.nameSnapshot,
        qtyMilli: it.qtyMilli,
        unitLabel: UNITS[it.product.unit as keyof typeof UNITS].label,
        unitPriceCents: it.unitPriceCents,
        vatGroup: it.vatGroup as VatGroupKey,
        discountPermille: it.discountPermille,
        totalCents: it.totalCents,
      })),
      payments: [
        ...(stornoCashCents > 0
          ? [{ type: "CASH" as const, amountCents: stornoCashCents }]
          : []),
        ...(stornoCardCents > 0
          ? [{ type: "CARD" as const, amountCents: stornoCardCents }]
          : []),
      ],
      totalCents: original.totalCents,
      changeCents: 0,
      dualDisplay: await isDualDisplayActive(),
      reason,
      originalReceiptNo: original.fiscalReceiptNo ?? String(original.number),
      originalReceiptDate: original.createdAt.toISOString(),
    });
    if (!receipt.ok) {
      await audit(s.userId, "STORNO_FISCAL_FAILED", "Sale", id, { error: receipt.error });
      throw jsonError(502, receipt.error ?? "Фискалното устройство отказа сторно бона.");
    }

    // връщане по картата при сторно на картова продажба (не при намаление на основата)
    let cardRefunded = false;
    if (!noCashMove && original.cardCents > 0 && original.terminalRef) {
      const terminal = await getTerminalDriver();
      const refund = await terminal?.refund(original.cardCents, original.terminalRef).catch(() => null);
      cardRefunded = !!refund?.ok;
      if (!cardRefunded) {
        // фискалният сторно бон е издаден, но картовото връщане не успя →
        // одитираме, за да се извърши ръчно връщане на терминала
        await audit(s.userId, "STORNO_CARD_REFUND_FAILED", "Sale", id, {
          cardCents: original.cardCents,
          terminalRef: original.terminalRef,
        });
      }
    }

    const returnStock = reason !== "TAX_BASE_CUT";
    const storno = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          unp,
          number,
          status: "STORNO",
          shiftId: shift.id,
          userId: s.userId,
          customerId: original.customerId,
          subtotalCents: original.subtotalCents,
          discountCents: original.discountCents,
          totalCents: original.totalCents,
          totalBgnCents: eurCentsToBgnCents(original.totalCents),
          paymentType: original.paymentType,
          cashCents: stornoCashCents,
          cardCents: stornoCardCents,
          terminalRef: original.terminalRef,
          fiscalReceiptNo: receipt.receiptNumber ?? null,
          fiscalDeviceSn: receipt.deviceSerial ?? fiscalCfg.deviceSerial,
          stornoOfId: original.id,
          stornoReason: reason,
          items: {
            create: original.items.map((it) => ({
              productId: it.productId,
              nameSnapshot: it.nameSnapshot,
              unitPriceCents: it.unitPriceCents,
              qtyMilli: it.qtyMilli,
              vatGroup: it.vatGroup,
              vatRatePermille: it.vatRatePermille,
              discountPermille: it.discountPermille,
              totalCents: it.totalCents,
              vatCents: it.vatCents,
            })),
          },
        },
      });

      // сторно на вересия: задължението се сваля от клиентската карта
      if (original.paymentType === "CREDIT" && original.customerId) {
        await tx.customer.update({
          where: { id: original.customerId },
          data: { balanceCents: { decrement: original.totalCents } },
        });
      }

      if (returnStock) {
        for (const it of original.items) {
          await tx.product.update({
            where: { id: it.productId },
            data: { stockMilli: { increment: it.qtyMilli } },
          });
          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              type: "STORNO",
              qtyMilliDelta: it.qtyMilli,
              refId: created.id,
            },
          });
        }
      }
      return created;
    });

    await audit(s.userId, "STORNO", "Sale", storno.id, {
      originalId: original.id,
      reason,
      totalCents: original.totalCents,
    });

    return Response.json(
      {
        storno,
        receiptText: receipt.receiptText ?? null,
        // ако картовото връщане не успя — фронтендът предупреждава за ръчно връщане
        cardRefundManual: !noCashMove && original.cardCents > 0 && !cardRefunded,
      },
      { status: 201 }
    );
  });
}
