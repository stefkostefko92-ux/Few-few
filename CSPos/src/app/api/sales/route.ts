// Плащане и приключване на открита продажба — сърцето на касата. Принципи:
// • Редовете идват от откритата продажба В БАЗАТА (т. 9.1), не от браузъра; сумите се смятат
//   само на сървъра.
// • т. 8: ФУ се проверява на живо ПРЕДИ картата — без готово ФУ няма плащане.
// • т. 2: OPEN → PAYING атомарно; второ натискане/втора заявка не печата втори бон.
// • Ред: карта → фискален бон с УНП (т. 10) → запис + склад в една транзакция.
//   Отказ на ФУ → връщане по картата и продажбата остава открита.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRead, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { fiscalNow, requireFiscalForPayment } from "@/lib/fiscal/link";
import { getTerminalDriver } from "@/lib/terminal";
import { eurCentsToBgnCents } from "@/lib/money";
import { getSetting, isDualDisplayActive } from "@/lib/settings";
import { UNITS } from "@/lib/constants";
import { nextSaleNumber } from "@/lib/counters";
import { manualDiscountAllowed, toFiscalItem } from "@/lib/pricing";
import { lockDraftForPayment, priceLines, pricingContext, releaseDraft } from "@/lib/sale-draft";

const paySchema = z.object({
  draftId: z.string().min(1),
  payment: z.object({
    type: z.enum(["CASH", "CARD", "MIXED", "CREDIT"]),
    cashCents: z.number().int().min(0).default(0),
    cardCents: z.number().int().min(0).default(0),
  }),
});

export async function GET(req: Request) {
  return guard(async () => {
    await requireRead("CASHIER");
    const url = new URL(req.url);
    const take = Math.min(Math.max(parseInt(url.searchParams.get("take") ?? "50", 10) || 50, 1), 200);
    const skip = Math.max(parseInt(url.searchParams.get("skip") ?? "0", 10) || 0, 0);
    const shiftId = url.searchParams.get("shiftId") ?? undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const where = {
      ...(shiftId && { shiftId }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(`${from}T00:00:00`) }),
          ...(to && { lte: new Date(`${to}T23:59:59.999`) }),
        },
      }),
    };
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          items: true,
          user: { select: { name: true } },
          invoice: { select: { number: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.sale.count({ where }),
    ]);
    return Response.json({ sales, total });
  });
}

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const parsed = paySchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за плащане.");
    const { draftId, payment } = parsed.data;

    const shift = await prisma.shift.findFirst({ where: { userId: s.userId, closedAt: null } });
    if (!shift) throw jsonError(409, "Няма отворена смяна — първо отворете смяна.");

    const draft = await prisma.saleDraft.findUnique({
      where: { id: draftId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!draft) throw jsonError(404, "Откритата продажба не е намерена.");
    if (draft.userId !== s.userId) throw jsonError(403, "Продажбата е открита от друг оператор.");
    if (draft.state !== "OPEN") throw jsonError(409, "Продажбата вече се плаща или е приключена.");
    if (draft.lines.length === 0) throw jsonError(400, "Бонът е празен.");

    const policy = await getSetting("pos");
    const maxManual = Math.max(0, ...draft.lines.map((l) => l.discountPermille));
    if (!manualDiscountAllowed(maxManual, s.role, policy.maxCashierDiscountPermille)) {
      throw jsonError(403, `Отстъпка над ${policy.maxCashierDiscountPermille / 10}% се дава от управител.`);
    }

    // сървърно остойностяване от записаните редове
    const { ctx, customer } = await pricingContext(draft.customerCard);
    const lines = await priceLines(draft.lines, ctx);
    const total = lines.reduce((a, l) => a + l.totalCents, 0);
    const subtotal = lines.reduce((a, l) => a + l.catalogCents, 0);

    // валидация на плащането
    const { type, cashCents, cardCents } = payment;
    if (type === "CREDIT" && !customer) throw jsonError(400, "Вересия се записва само на клиентска карта.");
    if (type === "CREDIT" && customer && customer.creditLimitCents > 0 && customer.balanceCents + total > customer.creditLimitCents) {
      throw jsonError(409, "Надвишен кредитен лимит на клиента. Погасете част от вересията.");
    }
    if (type === "CASH" && cashCents < total) throw jsonError(400, "Недостатъчна сума в брой.");
    if (type === "CARD" && cardCents !== total) throw jsonError(400, "Картовото плащане трябва да е точно колкото сумата.");
    if (type === "MIXED" && (cardCents <= 0 || cardCents > total || cashCents < total - cardCents)) {
      throw jsonError(400, "Невалидно смесено плащане.");
    }
    const paidCard = type === "CASH" || type === "CREDIT" ? 0 : cardCents;
    const paidCashDue = type === "CREDIT" ? 0 : total - paidCard;
    const change = type === "CARD" || type === "CREDIT" ? 0 : cashCents - paidCashDue;

    // т. 8: готовност на ФУ на живо — ПРЕДИ картата и преди заключването
    const liveSerial = await requireFiscalForPayment();

    if (!(await lockDraftForPayment(draftId, s.userId))) {
      throw jsonError(409, "Продажбата вече се плаща — изчакайте резултата.");
    }

    let terminalRef: string | null = null;
    let printed = false;
    try {
      // 1) картата минава първа през терминала
      if (paidCard > 0) {
        const terminal = await getTerminalDriver();
        if (terminal) {
          const t = await terminal.purchase(paidCard);
          if (!t.ok) throw jsonError(402, t.error ?? "Терминалът отказа плащането.");
          terminalRef = t.reference ?? null;
        }
      }

      // 2) фискален бон с УНП на откритата продажба
      const fiscalCfg = await getSetting("fiscal");
      const payments = [
        ...(paidCashDue > 0 ? [{ type: "CASH" as const, amountCents: paidCashDue + change }] : []),
        ...(paidCard > 0 ? [{ type: "CARD" as const, amountCents: paidCard }] : []),
        ...(type === "CREDIT" ? [{ type: "CREDIT" as const, amountCents: total }] : []),
      ];
      const fiscal = await getFiscalDriver();
      const receipt = await fiscal.printReceipt({
        unp: fiscalCfg.suptoMode ? draft.unp : null,
        operatorCode: s.operatorCode,
        operatorName: s.name,
        items: lines.map((l) => toFiscalItem(l, UNITS[l.product.unit as keyof typeof UNITS]?.label ?? "бр.")),
        payments,
        totalCents: total,
        changeCents: change,
        dualDisplay: await isDualDisplayActive(),
      });
      if (!receipt.ok) {
        await audit(s.userId, "FISCAL_FAILED", "SaleDraft", draft.id, { error: receipt.error }, { unp: draft.unp });
        throw jsonError(502, receipt.error ?? "Фискалното устройство не отговори.");
      }
      printed = true;

      // 3) запис + склад + приключване на откритата продажба — една транзакция
      const closedAt = await fiscalNow();
      const number = await nextSaleNumber();
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            unp: draft.unp,
            number,
            draftId: draft.id,
            openedAt: draft.openedAt,
            storeCode: draft.storeCode,
            workplaceCode: draft.workplaceCode,
            shiftId: shift.id,
            userId: s.userId,
            customerId: customer?.id ?? null,
            subtotalCents: subtotal,
            discountCents: subtotal - total,
            totalCents: total,
            totalBgnCents: eurCentsToBgnCents(total),
            paymentType: type,
            cashCents: paidCashDue,
            cardCents: paidCard,
            changeCents: change,
            fiscalReceiptNo: receipt.receiptNumber ?? null,
            fiscalDeviceSn: receipt.deviceSerial ?? liveSerial,
            terminalRef,
            createdAt: closedAt,
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
        const closed = await tx.saleDraft.updateMany({
          where: { id: draft.id, state: "PAYING" },
          data: { state: "COMPLETED", closedAt },
        });
        if (closed.count !== 1) throw new Error("Откритата продажба смени състоянието си по време на плащането.");
        if (type === "CREDIT" && customer) {
          await tx.customer.update({ where: { id: customer.id }, data: { balanceCents: { increment: total } } });
        }
        for (const l of lines) {
          await tx.product.update({ where: { id: l.product.id }, data: { stockMilli: { decrement: l.qtyMilli } } });
          await tx.stockMovement.create({
            data: { productId: l.product.id, type: "SALE", qtyMilliDelta: -l.qtyMilli, refId: created.id },
          });
        }
        return created;
      });

      await audit(
        s.userId,
        "SALE_COMPLETED",
        "Sale",
        sale.id,
        {
          number,
          totalCents: total,
          discountCents: subtotal - total,
          paymentType: type,
          fiscalReceiptNo: receipt.receiptNumber,
          fiscalDeviceSn: sale.fiscalDeviceSn,
        },
        { unp: draft.unp }
      );
      return Response.json({ sale, receiptText: receipt.receiptText ?? null }, { status: 201 });
    } catch (e) {
      if (printed) {
        // бонът е издаден, записът не успя: продажбата остава PAYING за сверка, картата НЕ се връща
        await audit(s.userId, "SALE_RECORD_FAILED", "SaleDraft", draft.id, {
          error: e instanceof Error ? e.message : String(e),
        }, { unp: draft.unp }).catch(() => undefined);
        throw jsonError(500, `Бонът е издаден, но записът не успя. Продажба ${draft.unp} е маркирана за сверка — уведомете управителя.`);
      }
      if (paidCard > 0 && terminalRef) {
        const terminal = await getTerminalDriver();
        const refund = await terminal?.refund(paidCard, terminalRef).catch(() => null);
        if (!refund?.ok) {
          // парите са взети, бон няма — връщането се прави ръчно, но следата остава
          await audit(s.userId, "CARD_REFUND_FAILED", "SaleDraft", draft.id, {
            cardCents: paidCard,
            terminalRef,
            error: refund?.error ?? "терминалът не отговори",
          }, { unp: draft.unp }).catch(() => undefined);
        }
      }
      await releaseDraft(draft.id);
      throw e;
    }
  });
}
