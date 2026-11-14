// Сверка на прекъснати плащания (Прил. № 29, т. 2). Продажба остава „в плащане“, когато
// процесът спре по време на плащането или бонът е издаден, а записът не успее. Без сверка тя
// блокира закриването на смяната. Управителят решава според ФУ:
// • „record“ — бонът Е издаден: продажбата се записва от запазените редове и плащане;
// • „release“ — бон НЯМА: продажбата се връща за ново плащане (картата — ръчно, ако е таксувана).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRead, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fiscalNow } from "@/lib/fiscal/link";
import { recordSale } from "@/lib/sale-record";
import { priceLines, pricingContext, type PaymentIntent } from "@/lib/sale-draft";

/** Плащане, което тече по-дълго от това, се смята за прекъснато (терминалите изтичат до ~90 s). */
const STALE_MS = 2 * 60 * 1000;

function isStale(d: { state: string; payingAt: Date | null }, now = Date.now()): boolean {
  return d.state === "RECONCILE" || (d.state === "PAYING" && (!d.payingAt || now - d.payingAt.getTime() > STALE_MS));
}

export async function GET() {
  return guard(async () => {
    await requireRead("MANAGER");
    const drafts = await prisma.saleDraft.findMany({
      where: { state: { in: ["PAYING", "RECONCILE"] } },
      include: { user: { select: { name: true, operatorCode: true } }, lines: true },
      orderBy: { openedAt: "asc" },
    });
    return Response.json({
      drafts: drafts.map((d) => ({
        id: d.id,
        unp: d.unp,
        state: d.state,
        stale: isStale(d),
        openedAt: d.openedAt,
        payingAt: d.payingAt,
        operator: d.user,
        lines: d.lines.length,
        payment: d.paymentJson ? (JSON.parse(d.paymentJson) as PaymentIntent) : null,
        fiscalReceiptNo: d.fiscalReceiptNo,
        terminalRef: d.terminalRef,
      })),
    });
  });
}

const schema = z.discriminatedUnion("resolution", [
  z.object({ draftId: z.string().min(1), resolution: z.literal("record"), receiptNumber: z.string().trim().min(1).max(40).optional() }),
  z.object({ draftId: z.string().min(1), resolution: z.literal("release") }),
]);

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидно решение за сверка.");
    const body = parsed.data;

    const draft = await prisma.saleDraft.findUnique({
      where: { id: body.draftId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!draft || !["PAYING", "RECONCILE"].includes(draft.state)) throw jsonError(404, "Няма прекъснато плащане с този номер.");
    if (!isStale(draft)) throw jsonError(409, "Плащането още тече — изчакайте две минути.");

    if (body.resolution === "release") {
      if (draft.fiscalReceiptNo) {
        throw jsonError(409, "За тази продажба има издаден бон — тя се записва, не се връща.");
      }
      const r = await prisma.saleDraft.updateMany({
        where: { id: draft.id, state: draft.state, fiscalReceiptNo: null },
        data: { state: "OPEN", payingAt: null, paymentJson: null, terminalRef: null },
      });
      if (r.count !== 1) throw jsonError(409, "Състоянието на продажбата се промени — опреснете.");
      await audit(s.userId, "SALE_RECONCILED", "SaleDraft", draft.id, {
        resolution: "release",
        cardChargedRef: draft.terminalRef,
      }, { unp: draft.unp });
      return Response.json({ ok: true, manualCardRefund: Boolean(draft.terminalRef) });
    }

    // record — бонът е издаден; номерът е от ФУ (запазен) или от управителя (от контролната лента)
    const receiptNumber = draft.fiscalReceiptNo && draft.fiscalReceiptNo !== "(без номер)" ? draft.fiscalReceiptNo : body.receiptNumber;
    if (!receiptNumber) throw jsonError(400, "Въведете номера на издадения бон от контролната лента на ФУ.");
    if (!draft.paymentJson) throw jsonError(409, "Липсва записано плащане — продажбата не може да се приключи автоматично.");
    const payment = JSON.parse(draft.paymentJson) as PaymentIntent;
    const { ctx, customer } = await pricingContext(draft.customerCard, new Date(), { lenient: true });
    const lines = await priceLines(draft.lines, ctx, { allowInactive: true });
    const total = lines.reduce((a, l) => a + l.totalCents, 0);
    if (total !== payment.totalCents) {
      throw jsonError(409, "Сумата по редовете не съвпада със запазеното плащане — нужна е ръчна проверка.");
    }
    const sale = await recordSale({
      draft,
      lines,
      customerId: customer?.id ?? null,
      payment,
      receipt: { receiptNumber, deviceSerial: draft.fiscalDeviceSn ?? draft.fiscalSerial },
      terminalRef: draft.terminalRef,
      closedAt: await fiscalNow(),
      fromStates: ["PAYING", "RECONCILE"],
    });
    await audit(s.userId, "SALE_RECONCILED", "Sale", sale.id, {
      resolution: "record",
      fiscalReceiptNo: receiptNumber,
      totalCents: total,
      operatorCode: draft.operatorCode,
    }, { unp: draft.unp });
    return Response.json({ sale }, { status: 201 });
  });
}
