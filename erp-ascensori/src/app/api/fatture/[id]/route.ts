// Fattura: детайл / промяна / изтриване (само BOZZA се трие — фискален архив).
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import {
  dettagliModifica,
  dettagliCancellazione
} from "@/lib/audit-dettagli";
import { fatturaSchema } from "@/lib/entities";
import { fatturaEliminabile } from "@/lib/regole-fiscali";

const include = {
  amministratore: true,
  ordineLavoro: { select: { numero: true, oggetto: true } },
  utente: { select: { nome: true, cognome: true } },
  voci: { orderBy: { ordine: "asc" as const } },
};

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const r = await prisma.fattura.findFirst({ where: { id, ...filtroTenant(s) }, include });
  if (!r) throw new ErroreHttp(404, "Fattura non trovata");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, fatturaSchema.partial());
  const prima = await prisma.fattura.findFirst({ where: { id, ...filtroTenant(s) } });
  if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
  // Фискална защита: издадената фактура е непроменима и в ЗАГЛАВИЕТО, не само
  // в редовете. Иначе датата се пренаписва назад (антидатиране) и получателят
  // се сменя върху вече изпратен документ.
  if (!fatturaEliminabile(prima.stato))
    throw new ErroreHttp(
      409,
      "Fattura già emessa: non modificabile. Emettere una nota di credito o uno storno"
    );
  const dopo = await prisma.fattura.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "fatture",
    entitaId: id,
    dettagli: dettagliModifica(prima, { ...(prima as object), ...(data as object) }),
    utenteId: s.sub,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const prima = await prisma.fattura.findFirst({ where: { id, ...filtroTenant(s) } });
  if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
  // фискална защита: издаден документ не се трие, а се сторнира (STORNATA)
  if (!fatturaEliminabile(prima.stato))
    throw new ErroreHttp(409, "Solo le bozze possono essere eliminate: usare lo storno");
  await prisma.fattura.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "fatture",
    entitaId: id,
    dettagli: dettagliCancellazione(prima),
    utenteId: s.sub,
  });
  return ok({ ok: true });
});
