// Смяна на статус на договор — САМО по позволените преходи.
// Активирането зарежда двата графика; прекратяването е финално.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeSessione, richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import {
  STATI_CONTRATTO,
  transizioneContrattoAmmessa,
  type StatoContratto,
} from "@/lib/regole-contratti";

const schema = z.object({ stato: z.enum(STATI_CONTRATTO) });

export const PATCH = gestito(async (req, ctx) => {
  await richiedeSessione();
  const { stato } = await corpoValidato(req, schema);
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;

  const dopo = await prisma.$transaction(async (tx) => {
    const prima = await tx.contratto.findFirst({
      where: { id, ...filtroTenant(s) },
    });
    if (!prima) throw new ErroreHttp(404, "Contratto non trovato");
    const da = prima.stato as StatoContratto;
    if (!transizioneContrattoAmmessa(da, stato))
      throw new ErroreHttp(
        409,
        `Passaggio non consentito: da «${da}» a «${stato}»`,
      );

    // Активирането зарежда графиците, ако още са празни (договор, създаден
    // като чернова преди месеци). Без това автоматизмът няма от какво да тръгне.
    const graficiVuoti = !prima.prossimaVisita || !prima.prossimaFattura;
    const upd = await tx.contratto.updateMany({
      where: { id, stato: da },
      data: {
        stato,
        ...(stato === "ATTIVO" && graficiVuoti
          ? {
              prossimaVisita: prima.dataInizio,
              prossimaFattura: prima.dataInizio,
            }
          : {}),
      },
    });
    if (upd.count === 0)
      throw new ErroreHttp(
        409,
        "Stato modificato da un'altra operazione: riprovare",
      );
    return tx.contratto.findUniqueOrThrow({ where: { id } });
  });

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "contratti",
    entitaId: id,
    dettagli: { valori: { stato: { a: stato } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});
