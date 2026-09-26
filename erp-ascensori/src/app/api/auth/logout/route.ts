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
import { trovaSessione, revocaSessione } from "@/lib/sessioni";

export const POST = gestito(async () => {
  const s = await sessioneCorrente();
  // Изходът затваря ТАЗИ сесия, не всички: работа от служебен и от домашен
  // компютър е нормална, а излизането от единия не бива да сваля другия.
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (token) {
    const sess = await trovaSessione(token);
    if (sess) await revocaSessione(sess.id, sess.utenteId);
  }
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
  } else if (token) {
    // access token изтекъл, но сесията пак трябва да е невъзстановима
    await prisma.user.updateMany({
      where: { refreshToken: hashRefresh(token) },
      data: { refreshToken: null },
    });
  }
  await cancellaCookieSessione();
  return ok({ ok: true });
});
