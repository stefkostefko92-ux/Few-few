// Отключване на акаунт преди края на блокадата (5 грешни опита → 15 мин).
// Случаят: човекът се е обадил, самоличността е потвърдена, чакането е излишно.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { utenteGestibile } from "@/lib/gestione-utenti";

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  await utenteGestibile(s, id);
  await prisma.user.update({
    where: { id },
    data: { tentativi: 0, bloccatoFino: null },
  });
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "users",
    entitaId: id,
    dettagli: { valori: { blocco: { a: "rimosso" } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
