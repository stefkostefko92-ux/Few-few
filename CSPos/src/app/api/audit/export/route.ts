// Експорт на одиторския дневник — Прил. № 29, т. 18: изнасяне на данните от т. 15–17
// в четим формат С ПРИЛОЖЕНИТЕ ФИЛТРИ. Достъпен за одиторския профил (т. 19), значи
// `requireRead`, не `requireRole` — иначе одиторът вижда дневника, но не може да го изнесе.

import { prisma } from "@/lib/db";
import { guard, requireRead } from "@/lib/auth";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  return guard(async () => {
    await requireRead("MANAGER");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // Филтрите са СЪЩИТЕ като на четящия маршрут — иначе експортът мълчаливо дава друг
    // обхват от показания на екрана, а т. 18 иска точно изнасяне на приложения филтър.
    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: new Date(from) }),
        // `to` се приема като КРАЙ на деня: филтър „до 05.08“ трябва да включва самия ден.
        ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, operatorCode: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Колоните следват РЕАЛНИЯ модел AuditLog (id/userId/action/entity/entityId/detail/createdAt).
    // ЗАБЕЛЕЖКА за собственика: моделът НЯМА отделно поле `unp`, а Прил. № 29, т. 15 иска УНП
    // при сторниране/анулиране. Ако УНП се пази вътре в JSON-а на `detail`, експортът го изнася
    // с него; ако не се пази — това е отделна дупка за схемата, не за експорта.
    const head = ["Дата и час", "Оператор", "Код на оператора", "Действие", "Обект", "ИД на обекта", "Детайли"];
    const rows = logs.map((l) => [
      l.createdAt.toISOString(),
      l.user?.name ?? "",
      l.user?.operatorCode ?? "",
      l.action,
      l.entity ?? "",
      l.entityId ?? "",
      l.detail ?? "",
    ]);

    const csv = toCsv([head, ...rows]);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="oditoren-dnevnik-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
