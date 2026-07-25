// Регистър на операциите — САМО четене, само ADMIN+ (MASTER вижда всичко).
// Никакъв маршрут за промяна/изтриване не съществува — по документация.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { paginazione, testoParam } from "@/lib/query";

export const GET = gestito(async (req) => {
  await richiedeRuolo("ADMIN");
  const url = new URL(req.url);
  const entita = testoParam(url, "entita");
  const azione = testoParam(url, "azione");
  const { page, size, skip, take } = paginazione(url);
  const where = {
    ...(entita ? { entita } : {}),
    ...(azione ? { azione } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { utente: { select: { nome: true, cognome: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
