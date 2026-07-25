// Изход: refresh token-ът се НУЛИРА в базата — сесията е невъзстановима.
import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { sessioneCorrente, cancellaCookieSessione } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";

export const POST = gestito(async () => {
  const s = await sessioneCorrente();
  if (s) {
    await prisma.user.update({ where: { id: s.sub }, data: { refreshToken: null } });
    await scriviAudit({ azione: "LOGOUT", entita: "users", entitaId: s.sub, utenteId: s.sub });
  }
  await cancellaCookieSessione();
  return ok({ ok: true });
});
