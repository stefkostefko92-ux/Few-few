// Нулиране на втория фактор на ЧУЖД акаунт — изгубен телефон без резервни кодове.
//
// Това е аварийният изход и затова е тесен: върху ADMIN/MASTER — само MASTER
// (`utenteGestibile` с `privilegiato`); всички сесии падат; при следващия вход
// задължителният фактор се иска наново. Следата в одита казва кой го е направил.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { revocaTutte } from "@/lib/sessioni";
import { utenteGestibile } from "@/lib/gestione-utenti";

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { id } = await ctx.params;
  await utenteGestibile(s, id, { privilegiato: true });
  await prisma.user.update({
    where: { id },
    data: {
      totpAttivo: false,
      totpSegreto: null,
      totpUltimoPasso: null,
      codiciRecupero: [],
    },
  });
  const sessioni = await revocaTutte(id);
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "users",
    entitaId: id,
    dettagli: { valori: { mfa: { a: "azzerato-da-amministratore" } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true, sessioniRevocate: sessioni });
});
