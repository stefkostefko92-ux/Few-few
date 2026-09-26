// PDF на фактурата. Икономически документ → DIREZIONE+, както и самият модул.
import { gestito, errore } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { generaPdf } from "@/lib/pdf/documento";
import { pdfFattura } from "@/lib/pdf/carica";
import { rispostaPdf } from "@/lib/pdf/risposta";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const doc = await pdfFattura(id, s.tenantId ?? null);
  if (!doc) return errore(404, "Fattura non trovata");
  return rispostaPdf(await generaPdf(doc), `${doc.numero}.pdf`);
});
