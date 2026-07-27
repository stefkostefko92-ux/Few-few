// Ordine di lavoro: детайл (със storico) / промяна на полетата (не статуса!) / изтриване.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica, dettagliCancellazione } from "@/lib/audit-dettagli";
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
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const r = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    include,
  });
  if (!r) throw new ErroreHttp(404, "Ordine non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, ordineSchema.partial());
  const prima = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Ordine non trovato");
  const dopo = await prisma.ordineLavoro.update({
    where: { id },
    data,
    include,
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "ordini_lavoro",
    entitaId: id,
    dettagli: dettagliModifica(prima, {
      ...(prima as object),
      ...(data as object),
    }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const prima = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Ordine non trovato");
  await prisma.ordineLavoro.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "ordini_lavoro",
    entitaId: id,
    dettagli: dettagliCancellazione(prima),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
