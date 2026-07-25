// Смяна на статус на preventivo. APPROVATO се пази за RESPONSABILE+ (гл. Controlli).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";

const schema = z.object({
  stato: z.enum(["BOZZA", "INVIATO", "APPROVATO", "RIFIUTATO", "SCADUTO"]),
});

export const PATCH = gestito(async (req, ctx) => {
  const { stato } = await corpoValidato(req, schema);
  // одобрение на оферти = координация → минимум RESPONSABILE
  const s = await richiedeRuolo(stato === "APPROVATO" ? "RESPONSABILE" : "OPERATORE");
  const { id } = await ctx.params;
  const prima = await prisma.preventivo.findUnique({ where: { id } });
  if (!prima) throw new ErroreHttp(404, "Preventivo non trovato");
  const dopo = await prisma.preventivo.update({ where: { id }, data: { stato } });
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "preventivi",
    entitaId: id,
    dettagli: { prima: prima.stato, dopo: stato },
    utenteId: s.sub,
  });
  return ok(dopo);
});
