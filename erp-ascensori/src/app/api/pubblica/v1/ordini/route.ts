// Публично API v1 — ордини за работа.
import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { paginazione, enumParam } from "@/lib/query";
import { richiedeChiave, filtroChiave } from "@/lib/api-pubblica/auth";

export const dynamic = "force-dynamic";

const STATI = [
  "BOZZA",
  "EMESSO",
  "CONFERMATO",
  "IN_LAVORO",
  "SOSPESO",
  "COMPLETATO",
  "CHIUSO",
  "CONTESTATO",
  "ANNULLATO",
] as const;

export const GET = gestito(async (req) => {
  const c = await richiedeChiave(req, "ordini:read");
  const url = new URL(req.url);
  const { page, size, skip, take } = paginazione(url);
  const stato = enumParam(url, "stato", STATI);

  const where = { ...filtroChiave(c), ...(stato ? { stato } : {}) };
  const [righe, totale] = await Promise.all([
    prisma.ordineLavoro.findMany({
      where,
      // `noteInterne` НЕ излиза: полето се казва точно така, защото не се
      // показва на клиента — камо ли през публично API.
      select: {
        id: true,
        numero: true,
        stato: true,
        priorita: true,
        oggetto: true,
        descrizione: true,
        dataInizio: true,
        dataFine: true,
        impianto: { select: { matricola: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.ordineLavoro.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
