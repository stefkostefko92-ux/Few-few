// PDF на отчета — техникът го показва за подпис и го оставя на клиента.
import { gestito, errore } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { generaPdf } from "@/lib/pdf/documento";
import { pdfRapportino } from "@/lib/pdf/carica";
import { rispostaPdf } from "@/lib/pdf/risposta";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const doc = await pdfRapportino(id, s.tenantId ?? null);
  if (!doc) return errore(404, "Rapportino non trovato");
  return rispostaPdf(await generaPdf(doc), `${doc.numero}.pdf`);
});
