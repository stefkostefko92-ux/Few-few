// Смяна на статус на фактура (BOZZA→EMESSA→INVIATA→PAGATA / SCADUTA / STORNATA).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";

const schema = z.object({
  stato: z.enum(["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"]),
});

export const PATCH = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { stato } = await corpoValidato(req, schema);
  const { id } = await ctx.params;
  const prima = await prisma.fattura.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
  const dopo = await prisma.fattura.update({ where: { id }, data: { stato } });
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: { prima: prima.stato, dopo: stato },
    utenteId: s.sub,
  });
  return ok(dopo);
});
