// Махане на вложен материал — частта се ВРЪЩА в склада, не изчезва.
//
// Редът се трие, но двете движения остават: изходящото и връщащото. Това не е
// педантизъм — регистърът на движенията е хронология, а хронология, от която
// се изтрива, не е доказателство за нищо. Наличността излиза същата; пътят до
// нея остава видим.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id, rigaId } = await ctx.params;

  const rapportino = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true, numero: true, firmatoAt: true, ordineLavoroId: true },
  });
  if (!rapportino) throw new ErroreHttp(404, "Rapportino non trovato");
  if (rapportino.firmatoAt)
    throw new ErroreHttp(
      409,
      "Rapportino già firmato: i materiali non sono più modificabili",
    );

  const riga = await prisma.materialeRapportino.findFirst({
    where: { id: rigaId, rapportinoId: id, ...filtroTenant(s) },
    include: { articolo: { select: { codice: true } } },
  });
  if (!riga) throw new ErroreHttp(404, "Riga non trovata");

  await prisma.$transaction(async (tx) => {
    // Изтриването на РЕДА е условно: две едновременни изтривания не могат да
    // върнат количеството два пъти.
    const via = await tx.materialeRapportino.deleteMany({ where: { id: rigaId } });
    if (via.count === 0) throw new ErroreHttp(409, "Riga già rimossa");

    await tx.articoloMagazzino.update({
      where: { id: riga.articoloId },
      data: { quantita: { increment: riga.quantita } },
    });
    await tx.movimentoMagazzino.create({
      data: {
        articoloId: riga.articoloId,
        tipo: "ENTRATA",
        quantita: riga.quantita,
        nota: `Reso da rapportino ${rapportino.numero}`,
        ordineLavoroId: rapportino.ordineLavoroId,
        ...tenantDiCreazione(s),
      },
    });
  });

  await scriviAudit({
    azione: "DELETE",
    entita: "materiali_rapportino",
    entitaId: rigaId,
    dettagli: {
      valori: {
        articolo: { da: riga.articolo.codice },
        quantita: { da: String(riga.quantita) },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok({ rimosso: true });
});
