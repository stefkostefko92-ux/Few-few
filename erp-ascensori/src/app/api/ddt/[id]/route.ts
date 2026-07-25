// DDT: детайл (с редове и движения) / промяна / изтриване.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { ddtSchema } from "@/lib/entities";

const include = {
  ordineLavoro: { select: { numero: true, oggetto: true } },
  righe: { orderBy: { ordine: "asc" as const } },
  movimenti: { include: { articolo: { select: { codice: true, nome: true } } } },
};

export const GET = gestito(async (_req, ctx) => {
  await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const r = await prisma.ddt.findUnique({ where: { id }, include });
  if (!r) throw new ErroreHttp(404, "DDT non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, ddtSchema.base.partial());
  const prima = await prisma.ddt.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "DDT non trovato");
  const dopo = await prisma.ddt.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "ddt",
    entitaId: id,
    dettagli: { prima, dopo: data },
    utenteId: s.sub,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const prima = await prisma.ddt.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "DDT non trovato");
  await prisma.ddt.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "ddt",
    entitaId: id,
    dettagli: { prima },
    utenteId: s.sub,
  });
  return ok({ ok: true });
});
