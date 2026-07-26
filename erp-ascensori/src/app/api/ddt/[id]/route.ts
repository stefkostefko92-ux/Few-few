// DDT: детайл (с редове и движения) / промяна / изтриване.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica, dettagliCancellazione } from "@/lib/audit-dettagli";
import { ddtSchema } from "@/lib/entities";

/**
 * DDT, закачен за фактура, е ЗАМРАЗЕН.
 *
 * ЗАЩО ТУК, А НЕ САМО В `/api/fatture/[id]/ddt`. XML-ът за SDI не се пази —
 * ражда се наново от живите редове при всяко четене (`sdi/carica.ts`), а типът
 * на документа се ИЗВЕЖДА: фактура с прикачени DDT е `TD24`, без тях — `TD01`.
 * Значи промяна на датата на DDT сменя `<DataDDT>` във вече подадена фактура,
 * а изтриването му я връща на `TD01` без `<DatiDDT>` — със същия номер и същия
 * `progressivoInvio`. Архивът за conservazione тогава предава документ,
 * РАЗЛИЧЕН от издадения, при README, който твърди обратното.
 *
 * Специализираният маршрут пази връзката „само в BOZZA"; тук се пази самият
 * DDT, защото това е другият вход към същите данни.
 */
function esigiScollegato(prima: { fatturaId: string | null }): void {
  if (prima.fatturaId)
    throw new ErroreHttp(
      409,
      "DDT collegato a una fattura: scollegarlo dalla fattura (possibile solo in bozza) prima di modificarlo o eliminarlo.",
    );
}

const include = {
  ordineLavoro: { select: { numero: true, oggetto: true } },
  righe: { orderBy: { ordine: "asc" as const } },
  movimenti: {
    include: { articolo: { select: { codice: true, nome: true } } },
  },
};

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const r = await prisma.ddt.findFirst({
    where: { id, ...filtroTenant(s) },
    include,
  });
  if (!r) throw new ErroreHttp(404, "DDT non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, ddtSchema.base.partial());
  const prima = await prisma.ddt.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "DDT non trovato");
  esigiScollegato(prima);
  const dopo = await prisma.ddt.update({ where: { id }, data, include });
  await scriviAudit({
    azione: "UPDATE",
    entita: "ddt",
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
  const prima = await prisma.ddt.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "DDT non trovato");
  esigiScollegato(prima);
  await prisma.ddt.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "ddt",
    entitaId: id,
    dettagli: dettagliCancellazione(prima),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
