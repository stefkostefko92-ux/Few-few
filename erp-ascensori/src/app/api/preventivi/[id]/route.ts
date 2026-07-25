// Preventivo: детайл / промяна / изтриване (редовете падат каскадно).
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { preventivoSchema } from "@/lib/entities";

const include = {
  impianto: true,
  amministratore: true,
  utente: { select: { nome: true, cognome: true } },
  voci: { orderBy: { ordine: "asc" as const } },
};

export const GET = gestito(async (_req, ctx) => {
  await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const r = await prisma.preventivo.findUnique({ where: { id }, include });
  if (!r) throw new ErroreHttp(404, "Preventivo non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, preventivoSchema.partial());
  const prima = await prisma.preventivo.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Preventivo non trovato");
  const dopo = await prisma.preventivo.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "preventivi",
    entitaId: id,
    dettagli: { prima, dopo: data },
    utenteId: s.sub,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const prima = await prisma.preventivo.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Preventivo non trovato");
  await prisma.preventivo.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "preventivi",
    entitaId: id,
    dettagli: { prima },
    utenteId: s.sub,
  });
  return ok({ ok: true });
});
