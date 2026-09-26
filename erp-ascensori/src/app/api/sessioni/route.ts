// Активните сесии на текущия потребител.
import { ok, gestito } from "@/lib/api";
import { richiedeSessione } from "@/lib/auth";
import { elencoSessioni, revocaTutte } from "@/lib/sessioni";
import { scriviAudit } from "@/lib/audit";

export const GET = gestito(async () => {
  const s = await richiedeSessione();
  const righe = await elencoSessioni(s.sub);
  // Коя е ТАЗИ — иначе човекът не знае кой ред да не прекратява.
  return ok({ righe: righe.map((r) => ({ ...r, corrente: r.id === s.sid })) });
});

/**
 * Прекратява ВСИЧКИ сесии — включително текущата. С `?altre=1` — всички
 * освен текущата: „изгубих телефона" не бива да изхвърля и компютъра, от който
 * човекът го казва.
 */
export const DELETE = gestito(async (req) => {
  const s = await richiedeSessione();
  const altre = new URL(req.url).searchParams.get("altre") === "1";
  const quante = await revocaTutte(s.sub, altre ? s.sid : undefined);
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
