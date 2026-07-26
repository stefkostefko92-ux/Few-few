// Прекратяване на ЕДНА сесия — „не разпознавам това устройство".
import { ok, gestito } from "@/lib/api";
import { richiedeSessione, ErroreHttp } from "@/lib/auth";
import { revocaSessione } from "@/lib/sessioni";
import { scriviAudit } from "@/lib/audit";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeSessione();
  const { id } = await ctx.params;
  // Обхватът по потребител е в самата заявка: чужда сесия не се прекратява
  // дори с познат идентификатор.
  if (!(await revocaSessione(id, s.sub)))
    throw new ErroreHttp(404, "Sessione non trovata");
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "sessioni_attive",
    entitaId: id,
    dettagli: { valori: { revocata: { a: "manuale" } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
