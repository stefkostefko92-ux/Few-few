// Плащане и приключване на открита продажба — сърцето на касата. Принципи:
// • Редовете идват от откритата продажба В БАЗАТА (т. 9.1), не от браузъра; сумите се смятат
//   само на сървъра — и се смятат НАНОВО след заключването (редовете не могат да се сменят
//   между проверката и печата).
// • т. 8: ФУ се проверява на живо ПРЕДИ картата — без готово ФУ няма плащане.
// • т. 2: OPEN → PAYING атомарно; второ натискане/втора заявка не печата втори бон.
//   Намерението за плащане, референцията на картата и номерът на бона се пазят веднага,
//   за да може прекъснато плащане да се свери (виж /api/sales/reconcile).
// • Ред: карта → фискален бон с УНП (т. 10) → запис + склад в една транзакция.
//   Отказ на ФУ → връщане по картата и продажбата остава открита.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRead, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { fiscalNow, requireFiscalForPayment } from "@/lib/fiscal/link";
import { getTerminalDriver } from "@/lib/terminal";
import { getSetting, isDualDisplayActive } from "@/lib/settings";
import { UNITS } from "@/lib/constants";
import { manualDiscountAllowed, toFiscalItem, type PricedLine } from "@/lib/pricing";
import { recordSale } from "@/lib/sale-record";
import {
  lockDraftForPayment,
  markCardCharged,
  markPrinted,
  markReconcile,
  priceLines,
  pricingContext,
  releaseDraft,
  type PaymentIntent,
} from "@/lib/sale-draft";

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

type Payment = z.infer<typeof paySchema>["payment"];

/** Валидира плащането срещу сумата и връща разпределението брой/карта/ресто. */
function settle(payment: Payment, total: number, customer: { balanceCents: number; creditLimitCents: number } | null): PaymentIntent {
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
  return { type, paidCashDue, paidCard, change, totalCents: total };
}

async function loadPriced(draftId: string, userId: string) {
  const draft = await prisma.saleDraft.findUnique({
    where: { id: draftId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!draft) throw jsonError(404, "Откритата продажба не е намерена.");
  if (draft.userId !== userId) throw jsonError(403, "Продажбата е открита от друг оператор.");
  if (draft.lines.length === 0) throw jsonError(400, "Бонът е празен.");
  const { ctx, customer } = await pricingContext(draft.customerCard);
  const lines = await priceLines(draft.lines, ctx);
  return { draft, lines, customer, total: lines.reduce((a, l) => a + l.totalCents, 0) };
}

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("CASHIER");
    const parsed = paySchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за плащане.");
    const { draftId, payment } = parsed.data;

    const shift = await prisma.shift.findFirst({ where: { userId: s.userId, closedAt: null } });
    if (!shift) throw jsonError(409, "Няма отворена смяна — първо отворете смяна.");

    const pre = await loadPriced(draftId, s.userId);
    if (pre.draft.state !== "OPEN") throw jsonError(409, "Продажбата вече се плаща или е приключена.");
    const policy = await getSetting("pos");
    const maxManual = Math.max(0, ...pre.draft.lines.map((l) => l.discountPermille));
    if (!manualDiscountAllowed(maxManual, s.role, policy.maxCashierDiscountPermille)) {
      throw jsonError(403, `Отстъпка над ${policy.maxCashierDiscountPermille / 10}% се дава от управител.`);
    }
    const intent = settle(payment, pre.total, pre.customer);

    // т. 8: готовност на ФУ на живо — ПРЕДИ картата и преди заключването
    const liveSerial = await requireFiscalForPayment();

    if (!(await lockDraftForPayment(draftId, s.userId, intent))) {
      throw jsonError(409, "Продажбата вече се плаща — изчакайте резултата.");
    }

    let terminalRef: string | null = null;
    let printed = false;
    let lines: PricedLine[] = [];
    let customerId: string | null = null;
    let receipt: { receiptNumber: string | null; deviceSerial: string | null; receiptText: string | null } | null = null;
    let sale: Awaited<ReturnType<typeof recordSale>> | null = null;
    try {
      // редовете — наново СЛЕД заключването: това, което се печата, е това, което се записва
      const locked = await loadPriced(draftId, s.userId);
      if (locked.total !== intent.totalCents) {
        throw jsonError(409, "Бонът се промени по време на плащането — потвърдете сумата отново.");
      }
      lines = locked.lines;
      customerId = locked.customer?.id ?? null;

      // 1) картата минава първа през терминала
      if (intent.paidCard > 0) {
        const terminal = await getTerminalDriver();
        if (terminal) {
          const t = await terminal.purchase(intent.paidCard);
          if (!t.ok) throw jsonError(402, t.error ?? "Терминалът отказа плащането.");
          terminalRef = t.reference ?? null;
          await markCardCharged(draftId, terminalRef);
        }
      }

      // 2) фискален бон с УНП на откритата продажба
      const fiscalCfg = await getSetting("fiscal");
      const fiscal = await getFiscalDriver();
      const r = await fiscal.printReceipt({
        unp: fiscalCfg.suptoMode ? locked.draft.unp : null,
        operatorCode: s.operatorCode,
        operatorName: s.name,
        items: lines.map((l) => toFiscalItem(l, UNITS[l.product.unit as keyof typeof UNITS]?.label ?? "бр.")),
        payments: [
          ...(intent.paidCashDue > 0 ? [{ type: "CASH" as const, amountCents: intent.paidCashDue + intent.change }] : []),
          ...(intent.paidCard > 0 ? [{ type: "CARD" as const, amountCents: intent.paidCard }] : []),
          ...(intent.type === "CREDIT" ? [{ type: "CREDIT" as const, amountCents: intent.totalCents }] : []),
        ],
        totalCents: intent.totalCents,
        changeCents: intent.change,
        dualDisplay: await isDualDisplayActive(),
      });
      if (!r.ok) {
        await audit(s.userId, "FISCAL_FAILED", "SaleDraft", draftId, { error: r.error }, { unp: locked.draft.unp });
        throw jsonError(502, r.error ?? "Фискалното устройство не отговори.");
      }
      printed = true;
      receipt = { receiptNumber: r.receiptNumber ?? null, deviceSerial: r.deviceSerial ?? liveSerial, receiptText: r.receiptText ?? null };
      await markPrinted(draftId, receipt.receiptNumber, receipt.deviceSerial);

      // 3) запис + склад + приключване на откритата продажба — една транзакция
      sale = await recordSale({
        draft: locked.draft,
        lines,
        customerId,
        payment: intent,
        receipt,
        terminalRef,
        closedAt: await fiscalNow(),
        fromStates: ["PAYING"],
      });
    } catch (e) {
      if (printed) {
        // бонът е издаден, записът не успя: сверка от управител; картата НЕ се връща
        await markReconcile(draftId).catch(() => undefined);
        await audit(s.userId, "SALE_RECORD_FAILED", "SaleDraft", draftId, {
          error: e instanceof Error ? e.message : String(e),
          fiscalReceiptNo: receipt?.receiptNumber,
        }, { unp: pre.draft.unp }).catch(() => undefined);
        throw jsonError(500, `Бонът е издаден, но записът не успя. Продажба ${pre.draft.unp} чака сверка — уведомете управителя.`);
      }
      if (intent.paidCard > 0 && terminalRef) {
        const terminal = await getTerminalDriver();
        const refund = await terminal?.refund(intent.paidCard, terminalRef).catch(() => null);
        if (!refund?.ok) {
          // парите са взети, бон няма — връщането се прави ръчно, но следата остава
          await audit(s.userId, "CARD_REFUND_FAILED", "SaleDraft", draftId, {
            cardCents: intent.paidCard,
            terminalRef,
            error: refund?.error ?? "терминалът не отговори",
          }, { unp: pre.draft.unp }).catch(() => undefined);
        }
      }
      await releaseDraft(draftId);
      throw e;
    }

    // одитът е след записа и ИЗВЪН catch-а: провален одит не превръща успешна продажба в „за сверка“
    await audit(
      s.userId,
      "SALE_COMPLETED",
      "Sale",
      sale.id,
      {
        number: sale.number,
        totalCents: intent.totalCents,
        discountCents: sale.discountCents,
        paymentType: intent.type,
        fiscalReceiptNo: receipt?.receiptNumber,
        fiscalDeviceSn: sale.fiscalDeviceSn,
      },
      { unp: sale.unp }
    ).catch((err) => console.error("[cspos audit]", err));
    return Response.json({ sale, receiptText: receipt?.receiptText ?? null }, { status: 201 });
  });
}
