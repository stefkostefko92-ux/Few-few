// Подновяване на сесията: валиден refresh token (сравнен по хеш) → нов access
// + РОТАЦИЯ на refresh token-а. Невалиден/нулиран token → 401.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ok, errore, gestito } from "@/lib/api";
import {
  REFRESH_COOKIE,
  hashRefresh,
  generaRefreshToken,
  creaAccessToken,
  scriviCookieSessione,
  cancellaCookieSessione,
  type Sessione,
} from "@/lib/auth";
import type { Ruolo } from "@/lib/roles";
import { consenti } from "@/lib/rate-limit";

export const POST = gestito(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "sconosciuto";
  if (!consenti(`refresh:${ip}`, 60, 15 * 60_000)) return errore(429, "Troppe richieste");

  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!token) return errore(401, "Sessione scaduta");

  const utente = await prisma.user.findFirst({
    where: { refreshToken: hashRefresh(token), attivo: true },
  });
  if (!utente) {
    await cancellaCookieSessione();
    return errore(401, "Sessione scaduta");
  }

  const { token: nuovo, hash } = generaRefreshToken();
  await prisma.user.update({ where: { id: utente.id }, data: { refreshToken: hash } });

  const sessione: Sessione = {
    sub: utente.id,
    ruolo: utente.ruolo as Ruolo,
    nome: `${utente.nome} ${utente.cognome}`,
    tenantId: utente.tenantId,
  };
  await scriviCookieSessione(await creaAccessToken(sessione), nuovo);
  return ok({ ok: true });
});
