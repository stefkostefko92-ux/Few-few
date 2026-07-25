// Ordine di lavoro: детайл (със storico) / промяна на полетата (не статуса!) / изтриване.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { ordineSchema } from "@/lib/entities";

const include = {
  impianto: true,
  tecnico: true,
  cottimista: true,
  squadra: true,
  preventivo: { select: { numero: true, totaleLordo: true } },
  storico: { orderBy: { createdAt: "desc" as const } },
  fatture: { select: { id: true, numero: true, stato: true } },
  ddt: { select: { id: true, numero: true, data: true } },
};

export const GET = gestito(async (_req, ctx) => {
  await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const r = await prisma.ordineLavoro.findUnique({ where: { id }, include });
  if (!r) throw new ErroreHttp(404, "Ordine non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, ordineSchema.partial());
  const prima = await prisma.ordineLavoro.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Ordine non trovato");
  const dopo = await prisma.ordineLavoro.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "ordini_lavoro",
    entitaId: id,
    dettagli: { prima, dopo: data },
    utenteId: s.sub,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const prima = await prisma.ordineLavoro.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Ordine non trovato");
  await prisma.ordineLavoro.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "ordini_lavoro",
    entitaId: id,
    dettagli: { prima },
    utenteId: s.sub,
  });
  return ok({ ok: true });
});
