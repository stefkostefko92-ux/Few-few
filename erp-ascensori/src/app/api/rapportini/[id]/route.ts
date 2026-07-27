// Отчет по id: четене и промяна ДО подписването.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica } from "@/lib/audit-dettagli";
import { rapportinoSchema } from "@/lib/entities";
import { rapportinoModificabile } from "@/lib/firma";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const r = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
    include: {
      tecnico: { select: { nome: true, cognome: true } },
      ordineLavoro: { select: { numero: true, oggetto: true } },
    },
  });
  if (!r) throw new ErroreHttp(404, "Rapportino non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, rapportinoSchema.partial());

  const prima = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Rapportino non trovato");
  // Подписаното не се променя — иначе подписът не доказва нищо.
  if (!rapportinoModificabile(prima.firmatoAt))
    throw new ErroreHttp(409, "Rapportino già firmato: non è più modificabile");

  const dopo = await prisma.rapportino.update({ where: { id }, data });
  await scriviAudit({
    azione: "UPDATE",
    entita: "rapportini",
    entitaId: id,
    dettagli: dettagliModifica(prima, { ...prima, ...data }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});
