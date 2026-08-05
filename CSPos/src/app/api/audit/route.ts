// Одиторски дневник — четене за одиторския профил (Прил. 29 т. 19) +
// записване на касови събития от POS екрана (анулиране на ред/бон с причина).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, jsonError, requireRead, requireRole, requireSession } from "@/lib/auth";

export async function GET(req: Request) {
  return guard(async () => {
    // ЧЕТЯЩ маршрут → `requireRead`, за да го вижда и одиторският профил.
    // Дотук стоеше зад `requireRole("MANAGER")`, тоест дневникът беше достъпен само за роля,
    // която и ПИШЕ (цени, стоки, настройки) — това не е „аналог на администраторския, но само
    // за четене“ по Прил. № 29, т. 19.
    await requireRead("MANAGER");
    const url = new URL(req.url);
    const take = Math.min(parseInt(url.searchParams.get("take") ?? "100", 10), 500);
    const action = url.searchParams.get("action") ?? undefined;

    const logs = await prisma.auditLog.findMany({
      where: action ? { action } : {},
      include: { user: { select: { name: true, operatorCode: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return Response.json({ logs });
  });
}

// Анулиране ПРЕДИ фискализация (маркиран ред/бон, който не се приключва) —
// записва се с причина, както изисква одиторската практика по Прил. 29.
const eventSchema = z.object({
  action: z.enum(["LINE_CANCELED", "CART_CLEARED"]),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireSession();
    const parsed = eventSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидно събитие.");
    await audit(s.userId, parsed.data.action, "Cart", undefined, parsed.data.detail);
    return Response.json({ ok: true }, { status: 201 });
  });
}
