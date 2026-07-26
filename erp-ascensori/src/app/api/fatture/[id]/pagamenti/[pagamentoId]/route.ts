// Изтриване на погрешно вписано постъпление.
//
// Плащането НЕ е фискален документ — то е вътрешно вписване, и погрешно
// въведена сума трябва да може да се махне. Затова изтриването е позволено, но
// оставя следа в одита: сверката с банката минава през нея.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCancellazione } from "@/lib/audit-dettagli";
import { ricalcolaPagamenti } from "@/lib/totali-db";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id, pagamentoId } = await ctx.params;

  const prima = await prisma.$transaction(async (tx) => {
    const f = await tx.fattura.findFirst({
      where: { id, ...filtroTenant(s) },
      select: { id: true },
    });
    if (!f) throw new ErroreHttp(404, "Fattura non trovata");
    const p = await tx.pagamento.findFirst({
      where: { id: pagamentoId, fatturaId: id },
    });
    if (!p) throw new ErroreHttp(404, "Pagamento non trovato");
    await tx.pagamento.delete({ where: { id: pagamentoId } });
    await ricalcolaPagamenti(id, tx);
    return p;
  });

  await scriviAudit({
    azione: "DELETE",
    entita: "pagamenti",
    entitaId: pagamentoId,
    dettagli: dettagliCancellazione(prima),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
