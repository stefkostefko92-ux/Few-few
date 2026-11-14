// Одиторски дневник — преглед с филтри (Прил. № 29, т. 16): период, оператор, вид действие,
// УНП; със страниране — достъп до всички записи (т. 17). Четящ маршрут → одиторският профил
// го вижда (т. 19). Записи от екрана НЕ се приемат: всяко анулиране се записва на сървъра,
// в потока на самата операция — клиентът не може да подправи дневника.

import { prisma } from "@/lib/db";
import { guard, requireRead } from "@/lib/auth";

export async function GET(req: Request) {
  return guard(async () => {
    await requireRead("MANAGER");
    const url = new URL(req.url);
    const take = Math.min(Math.max(parseInt(url.searchParams.get("take") ?? "100", 10) || 100, 1), 500);
    const skip = Math.max(parseInt(url.searchParams.get("skip") ?? "0", 10) || 0, 0);
    const action = url.searchParams.get("action") || undefined;
    const operator = url.searchParams.get("operator");
    const unp = url.searchParams.get("unp")?.trim() || undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const where = {
      ...(action && { action }),
      ...(unp && { unp: { contains: unp } }),
      ...(operator && /^\d{1,4}$/.test(operator) && { user: { operatorCode: Number(operator) } }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(`${from}T00:00:00`) }),
          ...(to && { lte: new Date(`${to}T23:59:59.999`) }),
        },
      }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, operatorCode: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return Response.json({ logs, total });
  });
}
