// Активните сесии на текущия потребител.
import { ok, gestito } from "@/lib/api";
import { richiedeSessione } from "@/lib/auth";
import { elencoSessioni, revocaTutte } from "@/lib/sessioni";
import { scriviAudit } from "@/lib/audit";

export const GET = gestito(async () => {
  const s = await richiedeSessione();
  return ok({ righe: await elencoSessioni(s.sub) });
});

/** Прекратява ВСИЧКИ сесии — включително текущата. */
export const DELETE = gestito(async () => {
  const s = await richiedeSessione();
  const quante = await revocaTutte(s.sub);
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "sessioni_attive",
    entitaId: s.sub,
    dettagli: { valori: { revocate: { a: String(quante) } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ revocate: quante });
});
