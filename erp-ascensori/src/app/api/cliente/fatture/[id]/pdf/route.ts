// PDF на фактура за клиента — само ако фактурата е негова и е издадена.
// 404 и за чужда, и за несъществуваща: отговорът не казва коя съществува.

import { prisma } from "@/lib/prisma";
import { gestito, errore } from "@/lib/api";
import { generaPdf } from "@/lib/pdf/documento";
import { pdfFattura } from "@/lib/pdf/carica";
import { rispostaPdf } from "@/lib/pdf/risposta";
import { sessioneCliente, filtroFattureCliente } from "@/lib/area-cliente";

export const GET = gestito(async (_req, ctx) => {
  const { s, amministratoreId } = await sessioneCliente();
  const { id } = await ctx.params;
  if (!amministratoreId) return errore(404, "Fattura non trovata");
  const sua = await prisma.fattura.findFirst({
    where: { id, ...filtroFattureCliente(s, amministratoreId) },
    select: { id: true },
  });
  if (!sua) return errore(404, "Fattura non trovata");
  const doc = await pdfFattura(id, s.tenantId ?? null);
  if (!doc) return errore(404, "Fattura non trovata");
  return rispostaPdf(await generaPdf(doc), `${doc.numero}.pdf`);
});
