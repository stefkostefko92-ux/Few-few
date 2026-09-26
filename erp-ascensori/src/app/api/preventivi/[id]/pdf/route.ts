// PDF на офертата — това, което се изпраща на клиента.
import { gestito, errore } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { generaPdf } from "@/lib/pdf/documento";
import { pdfPreventivo } from "@/lib/pdf/carica";
import { rispostaPdf } from "@/lib/pdf/risposta";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const doc = await pdfPreventivo(id, s.tenantId ?? null);
  if (!doc) return errore(404, "Preventivo non trovato");
  return rispostaPdf(await generaPdf(doc), `${doc.numero}.pdf`);
});
