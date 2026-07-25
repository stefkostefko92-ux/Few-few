// Регистър на операциите — САМО четене, само ADMIN+ (MASTER вижда всичко).
// Никакъв маршрут за промяна/изтриване не съществува — по документация.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";

export const GET = gestito(async (req) => {
  await richiedeRuolo("ADMIN");
  const url = new URL(req.url);
  const entita = url.searchParams.get("entita");
  const azione = url.searchParams.get("azione");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));
  const where = {
    ...(entita ? { entita } : {}),
    ...(azione ? { azione } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { utente: { select: { nome: true, cognome: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
