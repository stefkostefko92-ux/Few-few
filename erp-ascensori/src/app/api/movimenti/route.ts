// Движения на склада: giacenza-та се променя САМО тук, в транзакция.
// ENTRATA добавя, USCITA вади (не под нула), RETTIFICA е подписана корекция.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";

const schema = z.object({
  articoloId: z.string().uuid(),
  tipo: z.enum(["ENTRATA", "USCITA", "RETTIFICA"]),
  quantita: z.number().int(),
  nota: z.string().trim().max(500).nullish(),
  ddtId: z.string().uuid().nullish(),
});

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const url = new URL(req.url);
  const articoloId = url.searchParams.get("articoloId");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));
  const where = { ...filtroTenant(s), ...(articoloId ? { articoloId } : {}) };
  const [righe, totale] = await Promise.all([
    prisma.movimentoMagazzino.findMany({
      where,
      include: { articolo: { select: { codice: true, nome: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.movimentoMagazzino.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const data = await corpoValidato(req, schema);

  if (data.tipo !== "RETTIFICA" && data.quantita <= 0)
    throw new ErroreHttp(400, "La quantità deve essere positiva");
  if (data.tipo === "RETTIFICA" && data.quantita === 0)
    throw new ErroreHttp(400, "La rettifica non può essere zero");

  const movimento = await prisma.$transaction(async (tx) => {
    const articolo = await tx.articoloMagazzino.findUnique({ where: { id: data.articoloId } });
    if (!articolo) throw new ErroreHttp(404, "Articolo non trovato");

    const delta =
      data.tipo === "ENTRATA"
        ? data.quantita
        : data.tipo === "USCITA"
          ? -data.quantita
          : data.quantita; // RETTIFICA: подписана корекция

    // Атомарна корекция: условният UPDATE пази от загубена актуализация — две
    // едновременни USCITA не могат да свалят наличността под нула (READ COMMITTED).
    const upd = await tx.articoloMagazzino.updateMany({
      where: { id: data.articoloId, ...(delta < 0 ? { quantita: { gte: -delta } } : {}) },
      data: { quantita: { increment: delta } },
    });
    if (upd.count === 0)
      throw new ErroreHttp(409, `Giacenza insufficiente: disponibili ${articolo.quantita}`);

    return tx.movimentoMagazzino.create({
      data: {
        articoloId: data.articoloId,
        tipo: data.tipo,
        quantita: data.quantita,
        nota: data.nota ?? undefined,
        ddtId: data.ddtId ?? undefined,
        ...tenantDiCreazione(s),
      },
    });
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "movimenti_magazzino",
    entitaId: movimento.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
  });
  return ok(movimento, 201);
});
