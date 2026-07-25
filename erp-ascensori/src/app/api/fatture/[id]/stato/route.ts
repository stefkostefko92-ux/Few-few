// Смяна на статус на фактура — САМО по позволените преходи.
// Фискален документ не се връща назад: платена не става чернова, сторнирана е финална.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import {
  STATI_FATTURA,
  transizioneFatturaAmmessa,
  type StatoFattura,
} from "@/lib/regole-fiscali";

const schema = z.object({ stato: z.enum(STATI_FATTURA) });

export const PATCH = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { stato } = await corpoValidato(req, schema);
  const { id } = await ctx.params;

  const dopo = await prisma.$transaction(async (tx) => {
    const prima = await tx.fattura.findUnique({ where: { id } });
    if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
    const da = prima.stato as StatoFattura;
    if (!transizioneFatturaAmmessa(da, stato))
      throw new ErroreHttp(409, `Transizione non ammessa: ${da} → ${stato}`);
    // условен запис — пази от състезание между две едновременни промени
    const upd = await tx.fattura.updateMany({ where: { id, stato: da }, data: { stato } });
    if (upd.count === 0)
      throw new ErroreHttp(409, "Stato modificato da un'altra operazione: riprovare");
    return tx.fattura.findUniqueOrThrow({ where: { id } });
  });

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: { valori: { stato: { a: stato } } },
    utenteId: s.sub,
  });
  return ok(dopo);
});
