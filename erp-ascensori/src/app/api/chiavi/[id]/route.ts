// Отмяна на ключ. Изтриване НЯМА: отмененият ред остава като следа кой е имал
// достъп и докога — същата логика като при фискалния архив.

import { prisma } from "@/lib/prisma";
import { ok, errore, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  // Условен запис: втора отмяна не бива да пренаписва момента на първата.
  const { count } = await prisma.apiKey.updateMany({
    where: { id, ...filtroTenant(s), revocataAt: null },
    data: { revocataAt: new Date() },
  });
  if (count === 0) return errore(404, "Chiave non trovata");

  await scriviAudit({
    azione: "DELETE",
    entita: "api_keys",
    entitaId: id,
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
