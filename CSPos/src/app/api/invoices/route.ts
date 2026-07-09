// Фактури по чл. 114 ЗДДС: издаване към приключена продажба, последователна
// възходяща 10-разрядна номерация без пропуски. Сумите се снемат от продажбата.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildInvoiceText, type InvoiceLine } from "@/lib/invoice-text";
import { getSetting, isDualDisplayActive } from "@/lib/settings";
import { eurCentsToBgnCents } from "@/lib/money";
import { UNITS, type VatGroupKey } from "@/lib/constants";

export async function GET(req: Request) {
  return guard(async () => {
    await requireSession();
    const take = Math.min(parseInt(new URL(req.url).searchParams.get("take") ?? "50", 10), 200);
    const invoices = await prisma.invoice.findMany({
      include: { sale: { select: { number: true, unp: true } }, user: { select: { name: true } } },
      orderBy: { number: "desc" },
      take,
    });
    return Response.json({ invoices });
  });
}

const schema = z.object({
  saleId: z.string().min(1),
  buyerName: z.string().min(1).max(160),
  buyerEik: z.string().max(13).optional(),
  buyerVat: z.string().max(15).optional(),
  buyerAddress: z.string().max(200).optional(),
  buyerMol: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSession();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за фактура.");
    const d = parsed.data;

    const sale = await prisma.sale.findUnique({
      where: { id: d.saleId },
      include: { items: { include: { product: { select: { unit: true } } } }, invoice: true },
    });
    if (!sale) throw jsonError(404, "Продажбата не е намерена.");
    if (sale.status === "STORNO") throw jsonError(409, "Не се издава фактура към сторно.");
    if (sale.invoice) throw jsonError(409, "Към тази продажба вече има фактура.");

    const net = sale.items.reduce((a, it) => a + (it.totalCents - it.vatCents), 0);
    const vat = sale.items.reduce((a, it) => a + it.vatCents, 0);
    const total = net + vat;

    // пореден номер — атомарно в транзакция
    const number = await prisma.$transaction(async (tx) => {
      const row = await tx.setting.findUnique({ where: { key: "invoiceCounter" } });
      const next = (row ? (JSON.parse(row.value) as number) : 0) + 1;
      await tx.setting.upsert({
        where: { key: "invoiceCounter" },
        create: { key: "invoiceCounter", value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) },
      });
      return next;
    });

    const invoice = await prisma.invoice.create({
      data: {
        number,
        saleId: sale.id,
        userId: s.userId,
        buyerName: d.buyerName,
        buyerEik: d.buyerEik ?? null,
        buyerVat: d.buyerVat ?? null,
        buyerAddress: d.buyerAddress ?? null,
        buyerMol: d.buyerMol ?? null,
        netCents: net,
        vatCents: vat,
        totalCents: total,
        totalBgnCents: eurCentsToBgnCents(total),
      },
    });

    const store = await getSetting("store");
    const dualDisplay = await isDualDisplayActive();
    const lines: InvoiceLine[] = sale.items.map((it) => ({
      name: it.nameSnapshot,
      qtyMilli: it.qtyMilli,
      unitLabel: UNITS[it.product.unit as keyof typeof UNITS].label,
      unitPriceCents: it.unitPriceCents,
      vatGroup: it.vatGroup as VatGroupKey,
      vatRatePermille: it.vatRatePermille,
      totalCents: it.totalCents,
      vatCents: it.vatCents,
    }));
    const invoiceText = buildInvoiceText(
      store,
      {
        name: d.buyerName,
        eik: d.buyerEik,
        vat: d.buyerVat,
        address: d.buyerAddress,
        mol: d.buyerMol,
      },
      lines,
      {
        number,
        date: invoice.createdAt,
        fiscalReceiptNo: sale.fiscalReceiptNo,
        dualDisplay,
      }
    );

    await audit(s.userId, "INVOICE_ISSUED", "Invoice", invoice.id, {
      number,
      saleNumber: sale.number,
      totalCents: total,
    });

    return Response.json({ invoice, invoiceText }, { status: 201 });
  });
}
