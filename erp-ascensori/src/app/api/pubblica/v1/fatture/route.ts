// Публично API v1 — фактури. Това е маршрутът, заради който съществува API-то:
// счетоводният софтуер на клиента дърпа документите, вместо да ги преписва.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { paginazione, enumParam } from "@/lib/query";
import { richiedeChiave, filtroChiave } from "@/lib/api-pubblica/auth";

export const dynamic = "force-dynamic";

const STATI = ["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"] as const;

export const GET = gestito(async (req) => {
  const c = await richiedeChiave(req, "fatture:read");
  const url = new URL(req.url);
  const { page, size, skip, take } = paginazione(url);
  const stato = enumParam(url, "stato", STATI);
  const da = url.searchParams.get("da");

  const where = {
    ...filtroChiave(c),
    ...(stato ? { stato } : {}),
    ...(da && !Number.isNaN(new Date(da).getTime()) ? { data: { gte: new Date(da) } } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.fattura.findMany({
      where,
      select: {
        id: true,
        numero: true,
        tipo: true,
        stato: true,
        data: true,
        dataScadenza: true,
        oggetto: true,
        totaleNetto: true,
        totaleIva: true,
        totaleLordo: true,
        amministratore: { select: { ragioneSociale: true, partitaIva: true } },
        voci: {
          select: { descrizione: true, quantita: true, prezzoUnitario: true, aliquotaIva: true },
        },
      },
      orderBy: { data: "desc" },
      skip,
      take,
    }),
    prisma.fattura.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
