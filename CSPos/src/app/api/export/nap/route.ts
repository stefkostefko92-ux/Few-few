// Експорт на продажбите в CSV — по модела на стандартизирания одиторски
// експорт от Приложение № 29 (табличен формат, филтри по период).
// При деклариран СУПТО режим това е задължителна функционалност.

import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatCents } from "@/lib/money";
import { STORNO_REASONS, type StornoReasonKey } from "@/lib/constants";

function csvField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) throw jsonError(400, "Задайте период from/to.");

    const sales = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: new Date(`${from}T00:00:00`),
          lte: new Date(`${to}T23:59:59.999`),
        },
      },
      include: { items: true, user: { select: { name: true, operatorCode: true } } },
      orderBy: { number: "asc" },
    });

    const header = [
      "УНП",
      "Номер",
      "Тип",
      "Дата и час",
      "Оператор",
      "Код оператор",
      "Артикул",
      "Количество",
      "Ед. цена (EUR)",
      "Данъчна група",
      "ДДС ставка %",
      "Отстъпка %",
      "Редова сума (EUR)",
      "ДДС (EUR)",
      "Обща сума (EUR)",
      "Плащане",
      "Фискален бон №",
      "ФУ сериен №",
      "Причина сторно",
    ].join(";");

    const rows: string[] = [header];
    for (const sale of sales) {
      for (const it of sale.items) {
        rows.push(
          [
            csvField(sale.unp),
            sale.number,
            sale.status === "STORNO" ? "СТОРНО" : "ПРОДАЖБА",
            sale.createdAt.toISOString(),
            csvField(sale.user.name),
            sale.user.operatorCode,
            csvField(it.nameSnapshot),
            (it.qtyMilli / 1000).toFixed(3),
            formatCents(it.unitPriceCents),
            it.vatGroup,
            (it.vatRatePermille / 10).toFixed(1),
            (it.discountPermille / 10).toFixed(1),
            formatCents(it.totalCents),
            formatCents(it.vatCents),
            formatCents(sale.totalCents),
            sale.paymentType,
            csvField(sale.fiscalReceiptNo),
            csvField(sale.fiscalDeviceSn),
            csvField(
              sale.stornoReason
                ? STORNO_REASONS[sale.stornoReason as StornoReasonKey]
                : ""
            ),
          ].join(";")
        );
      }
    }

    await audit(s.userId, "NAP_EXPORT", "Sale", undefined, { from, to, rows: rows.length - 1 });

    // BOM за Excel + CSV с ; разделител (български регионални настройки)
    const csv = "﻿" + rows.join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prodajbi_${from}_${to}.csv"`,
      },
    });
  });
}
