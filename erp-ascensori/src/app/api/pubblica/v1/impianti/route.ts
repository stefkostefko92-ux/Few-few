// Публично API v1 — импианти.
//
// Версията е В ПЪТЯ, не в заглавие: външната интеграция се пише веднъж и живее
// години, а „по подразбиране последната версия" я чупи мълчаливо при следващия
// ни релийз.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { paginazione, testoParam } from "@/lib/query";
import { richiedeChiave, filtroChiave } from "@/lib/api-pubblica/auth";

export const dynamic = "force-dynamic";

export const GET = gestito(async (req) => {
  const c = await richiedeChiave(req, "impianti:read");
  const url = new URL(req.url);
  const q = testoParam(url);
  const { page, size, skip, take } = paginazione(url);

  const where = {
    ...filtroChiave(c),
    ...(q ? { matricola: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.impianto.findMany({
      where,
      // Изричен подбор: външната система НЕ бива да получава вътрешни бележки
      // само защото сме добавили колона.
      select: {
        id: true,
        matricola: true,
        marca: true,
        modello: true,
        stato: true,
        anno: true,
        indirizzo: true,
        prossimaRevisione: true,
        condominio: { select: { nome: true, citta: true } },
      },
      orderBy: { matricola: "asc" },
      skip,
      take,
    }),
    prisma.impianto.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
