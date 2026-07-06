// Продажба — сърцето на касата. Принципи:
// • Сумите се изчисляват САМО на сървъра (клиентът праща стоки и количества).
// • Без отворена смяна няма продажба.
// • Карта: първо терминалът одобрява, после се печата фискалният бон (Н-18);
//   ако бонът се провали — опит за автоматично връщане по картата.
// • УНП се генерира при откриване на продажбата (Прил. 29 т. 9).
// • Складът се изписва в същата транзакция (единна складова книга).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { getTerminalDriver } from "@/lib/terminal";
import { buildUnp } from "@/lib/unp";
import { applyDiscount, eurCentsToBgnCents, lineTotalCents } from "@/lib/money";
import { includedVatCents } from "@/lib/vat";
import { getSetting, getVatRates, isDualDisplayActive } from "@/lib/settings";
import { UNITS, type VatGroupKey } from "@/lib/constants";
import { bestPromotion } from "@/lib/promotions";
import { nextSaleNumber } from "@/lib/counters";
import { fetchActivePromotions } from "@/lib/promotions-db";
import type { FiscalItem } from "@/lib/fiscal/types";

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qtyMilli: z.number().int().min(1).max(1_000_000_000),
        discountPermille: z.number().int().min(0).max(999).default(0),
        /** заключена цена от ценови баркод (29…) — редова сума */
        priceLockedCents: z.number().int().min(0).optional(),
      })
    )
    .min(1),
  payment: z.object({
    type: z.enum(["CASH", "CARD", "MIXED", "CREDIT"]),
    cashCents: z.number().int().min(0).default(0),
    cardCents: z.number().int().min(0).default(0),
  }),
  customerCard: z.string().max(32).optional(),
});

export async function GET(req: Request) {
  return guard(async () => {
    await requireSession();
    const url = new URL(req.url);
    const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200);
    const shiftId = url.searchParams.get("shiftId") ?? undefined;
    const sales = await prisma.sale.findMany({
      where: shiftId ? { shiftId } : {},
      include: {
        items: true,
        user: { select: { name: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return Response.json({ sales });
  });
}

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSession();
    const parsed = saleSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за продажба.");
    const body = parsed.data;

    const shift = await prisma.shift.findFirst({
      where: { userId: s.userId, closedAt: null },
    });
    if (!shift) throw jsonError(409, "Няма отворена смяна — първо отворете смяна.");

    // клиентска карта (лоялност)
    const customer = body.customerCard
      ? await prisma.customer.findUnique({ where: { cardNumber: body.customerCard } })
      : null;
    if (body.customerCard && (!customer || !customer.active)) {
      throw jsonError(404, "Клиентската карта не е намерена.");
    }

    // сървърно остойностяване
    const vatRates = await getVatRates();
    const now = new Date();
    const promos = await fetchActivePromotions(now);
    const ids = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const lines = body.items.map((i) => {
      const p = byId.get(i.productId);
      if (!p || !p.active) throw jsonError(404, "Стока от количката не е намерена.");
      const catalogLine = lineTotalCents(p.priceCents, i.qtyMilli);
      const customerDiscount = Math.max(i.discountPermille, customer?.discountPermille ?? 0);
      const rate = vatRates[p.vatGroup as VatGroupKey];

      // Заключена цена (свободна продажба / ценови баркод) прескача промоциите.
      if (i.priceLockedCents !== undefined) {
        const total = applyDiscount(i.priceLockedCents, customerDiscount);
        subtotal += i.priceLockedCents;
        return {
          product: p, qtyMilli: i.qtyMilli, unitCents: p.priceCents,
          discountPermille: customerDiscount, discountCents: 0, promotion: null,
          totalCents: total, vatRatePermille: rate, vatCents: includedVatCents(total, rate),
        };
      }

      const promo = bestPromotion(p, i.qtyMilli, promos, now);
      subtotal += catalogLine;
      const isMxn = promo.promotion?.kind === "MXN";

      if (isMxn) {
        // MxN = абсолютна отстъпка; печели по-изгодното (MxN vs клиентска отстъпка), не се стакира
        const promoAbs = catalogLine - promo.lineCents;
        const custAbs = catalogLine - applyDiscount(catalogLine, customerDiscount);
        const discountCents = Math.max(promoAbs, custAbs);
        const total = catalogLine - discountCents;
        return {
          product: p, qtyMilli: i.qtyMilli, unitCents: p.priceCents,
          discountPermille: 0, discountCents, promotion: promo.promotion,
          totalCents: total, vatRatePermille: rate, vatCents: includedVatCents(total, rate),
        };
      }

      // PERCENT/PRICE сменят единичната цена; клиентската отстъпка се прилага отгоре
      const unitCents = promo.unitCents;
      const raw = lineTotalCents(unitCents, i.qtyMilli);
      const total = applyDiscount(raw, customerDiscount);
      return {
        product: p, qtyMilli: i.qtyMilli, unitCents,
        discountPermille: customerDiscount, discountCents: 0, promotion: promo.promotion,
        totalCents: total, vatRatePermille: rate, vatCents: includedVatCents(total, rate),
      };
    });
    const total = lines.reduce((acc, l) => acc + l.totalCents, 0);
    const discountTotal = subtotal - total;

    // валидация на плащането
    const { type, cashCents, cardCents } = body.payment;
    if (type === "CREDIT" && !customer) {
      throw jsonError(400, "Вересия се записва само на клиентска карта.");
    }
    // таван на вересията (ако е зададен) — не позволяваме неограничено задължение
    if (type === "CREDIT" && customer && customer.creditLimitCents > 0) {
      if (customer.balanceCents + total > customer.creditLimitCents) {
        throw jsonError(
          409,
          "Надвишен кредитен лимит на клиента. Погасете част от вересията."
        );
      }
    }
    if (type === "CASH" && cashCents < total) throw jsonError(400, "Недостатъчна сума в брой.");
    if (type === "CARD" && cardCents !== total) {
      throw jsonError(400, "Картовото плащане трябва да е точно колкото сумата.");
    }
    if (type === "MIXED" && (cardCents <= 0 || cardCents > total || cashCents < total - cardCents)) {
      throw jsonError(400, "Невалидно смесено плащане.");
    }
    const paidCard = type === "CASH" || type === "CREDIT" ? 0 : cardCents;
    const paidCashDue = type === "CREDIT" ? 0 : total - paidCard; // дължимото в брой
    const change = type === "CARD" || type === "CREDIT" ? 0 : cashCents - paidCashDue;

    // 1) картата минава първа през терминала
    let terminalRef: string | null = null;
    if (paidCard > 0) {
      const terminal = await getTerminalDriver();
      if (terminal) {
        const t = await terminal.purchase(paidCard);
        if (!t.ok) throw jsonError(402, t.error ?? "Терминалът отказа плащането.");
        terminalRef = t.reference ?? null;
      }
    }

    // 2) УНП + фискален бон
    const fiscalCfg = await getSetting("fiscal");
    const number = await nextSaleNumber();
    const unp = buildUnp(fiscalCfg.deviceSerial, s.operatorCode, number);
    const dualDisplay = await isDualDisplayActive();

    const fiscalItems: FiscalItem[] = lines.map((l) => ({
      name: l.product.name,
      qtyMilli: l.qtyMilli,
      unitLabel: UNITS[l.product.unit as keyof typeof UNITS].label,
      unitPriceCents: l.unitCents, // ефективна цена (с промоция)
      vatGroup: l.product.vatGroup as VatGroupKey,
      discountPermille: l.discountPermille,
      discountCents: l.discountCents,
      totalCents: l.totalCents,
    }));
    // на бона: В БРОЙ = подадената сума (рестото се показва отделно)
    const payments = [
      ...(paidCashDue > 0
        ? [{ type: "CASH" as const, amountCents: paidCashDue + change }]
        : []),
      ...(paidCard > 0 ? [{ type: "CARD" as const, amountCents: paidCard }] : []),
      ...(type === "CREDIT" ? [{ type: "CREDIT" as const, amountCents: total }] : []),
    ];

    const fiscal = await getFiscalDriver();
    const receipt = await fiscal.printReceipt({
      unp: fiscalCfg.suptoMode ? unp : null,
      operatorCode: s.operatorCode,
      operatorName: s.name,
      items: fiscalItems,
      payments,
      totalCents: total,
      changeCents: change,
      dualDisplay,
    });

    if (!receipt.ok) {
      // касата НЕ записва продажба без фискален бон; връщаме картата, ако мина
      if (paidCard > 0 && terminalRef) {
        const terminal = await getTerminalDriver();
        await terminal?.refund(paidCard, terminalRef).catch(() => undefined);
      }
      await audit(s.userId, "FISCAL_FAILED", "Sale", unp, { error: receipt.error });
      throw jsonError(502, receipt.error ?? "Фискалното устройство не отговори.");
    }

    // 3) запис + склад в една транзакция
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          unp,
          number,
          shiftId: shift.id,
          userId: s.userId,
          customerId: customer?.id ?? null,
          subtotalCents: subtotal,
          discountCents: discountTotal,
          totalCents: total,
          totalBgnCents: eurCentsToBgnCents(total),
          paymentType: type,
          cashCents: paidCashDue,
          cardCents: paidCard,
          changeCents: change,
          fiscalReceiptNo: receipt.receiptNumber ?? null,
          fiscalDeviceSn: receipt.deviceSerial ?? fiscalCfg.deviceSerial,
          terminalRef,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              nameSnapshot: l.product.name,
              unitPriceCents: l.unitCents, // ефективна цена (с промоция)
              qtyMilli: l.qtyMilli,
              vatGroup: l.product.vatGroup,
              vatRatePermille: l.vatRatePermille,
              discountPermille: l.discountPermille,
              totalCents: l.totalCents,
              vatCents: l.vatCents,
            })),
          },
        },
        include: { items: true },
      });

      // вересия: задължението отива по клиентската карта
      if (type === "CREDIT" && customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { balanceCents: { increment: total } },
        });
      }

      for (const l of lines) {
        await tx.product.update({
          where: { id: l.product.id },
          data: { stockMilli: { decrement: l.qtyMilli } },
        });
        await tx.stockMovement.create({
          data: {
            productId: l.product.id,
            type: "SALE",
            qtyMilliDelta: -l.qtyMilli,
            refId: created.id,
          },
        });
      }
      return created;
    });

    await audit(s.userId, "SALE_COMPLETED", "Sale", sale.id, {
      unp,
      totalCents: total,
      paymentType: type,
      fiscalReceiptNo: receipt.receiptNumber,
    });

    return Response.json(
      { sale, receiptText: receipt.receiptText ?? null },
      { status: 201 }
    );
  });
}
