// Прекратява всички сесии на чужд акаунт — „този лаптоп е откраднат".
// Паролата остава: човекът влиза пак от своето устройство.

import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { revocaTutte } from "@/lib/sessioni";
import { utenteGestibile } from "@/lib/gestione-utenti";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  await utenteGestibile(s, id);
  const revocate = await revocaTutte(id);
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "sessioni_attive",
    entitaId: id,
    dettagli: { valori: { revocate: { a: String(revocate) } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true, sessioniRevocate: revocate });
});
