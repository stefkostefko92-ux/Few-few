// Изход: refresh token-ът се НУЛИРА в базата — сесията е невъзстановима.
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import {
  sessioneCorrente,
  cancellaCookieSessione,
  REFRESH_COOKIE,
  hashRefresh,
} from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";

export const POST = gestito(async () => {
  const s = await sessioneCorrente();
  if (s) {
    await prisma.user.update({
      where: { id: s.sub },
      data: { refreshToken: null },
    });
    await scriviAudit({
      azione: "LOGOUT",
      entita: "users",
      entitaId: s.sub,
      utenteId: s.sub,
    });
  } else {
    // access token изтекъл, но сесията пак трябва да е невъзстановима:
    // нулираме refresh token-а по неговия хеш
    const token = (await cookies()).get(REFRESH_COOKIE)?.value;
    if (token)
      await prisma.user.updateMany({
        where: { refreshToken: hashRefresh(token) },
        data: { refreshToken: null },
      });
  }
  await cancellaCookieSessione();
  return ok({ ok: true });
});
