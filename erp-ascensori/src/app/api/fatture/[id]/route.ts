// Fattura: детайл / промяна / изтриване (само BOZZA се трие — фискален архив).
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { fatturaSchema } from "@/lib/entities";

const include = {
  amministratore: true,
  ordineLavoro: { select: { numero: true, oggetto: true } },
  utente: { select: { nome: true, cognome: true } },
  voci: { orderBy: { ordine: "asc" as const } },
};

export const GET = gestito(async (_req, ctx) => {
  await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const r = await prisma.fattura.findUnique({ where: { id }, include });
  if (!r) throw new ErroreHttp(404, "Fattura non trovata");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, fatturaSchema.partial());
  const prima = await prisma.fattura.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
  const dopo = await prisma.fattura.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "fatture",
    entitaId: id,
    dettagli: { prima, dopo: data },
    utenteId: s.sub,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const prima = await prisma.fattura.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
  // фискална защита: издаден документ не се трие, а се сторнира (STORNATA)
  if (prima.stato !== "BOZZA")
    throw new ErroreHttp(409, "Solo le bozze possono essere eliminate: usare lo storno");
  await prisma.fattura.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "fatture",
    entitaId: id,
    dettagli: { prima },
    utenteId: s.sub,
  });
  return ok({ ok: true });
});
