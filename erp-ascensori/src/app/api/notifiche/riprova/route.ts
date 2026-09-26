// „Riprova le fallite" — връща изчерпаните известия в опашката. НЕ праща.
//
// Изпращането остава автоматизъм (`npm run notifiche`, следа в
// `automatismi_run`), затова тук няма бутон „прати сега" (виж `../route.ts`).
// Това е само нулиране: след поправено SMTP реле провалените известия иначе
// стояха завинаги — „FALLITA" е краен статус.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { filtroTenant } from "@/lib/tenant";

export const POST = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const { count } = await prisma.notifica.updateMany({
    where: { ...filtroTenant(s), stato: "FALLITA" },
    data: {
      stato: "IN_ATTESA",
      tentativi: 0,
      prossimoTentativo: new Date(),
      ultimoErrore: null,
    },
  });
  if (count > 0)
    await scriviAudit({
      azione: "STATE_CHANGE",
      entita: "notifiche",
      entitaId: s.sub,
      dettagli: { valori: { rimesseInCoda: { a: String(count) } } },
      utenteId: s.sub,
      tenantId: s.tenantId,
    });
  return ok({ rimesseInCoda: count });
});
