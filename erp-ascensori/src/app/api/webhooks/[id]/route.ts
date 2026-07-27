// Спиране на абонамент.
import { prisma } from "@/lib/prisma";
import { ok, errore, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  const { count } = await prisma.webhook.deleteMany({
    where: { id, ...filtroTenant(s) },
  });
  if (count === 0) return errore(404, "Webhook non trovato");
  await scriviAudit({
    azione: "DELETE",
    entita: "webhooks",
    entitaId: id,
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
