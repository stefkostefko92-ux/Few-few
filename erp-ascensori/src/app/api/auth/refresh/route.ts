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
import { consenti, LIMITI } from "@/lib/rate-limit";
import { ipClient } from "@/lib/ip-client";

export const POST = gestito(async (req) => {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!token) return errore(401, "Sessione scaduta");

  // Ограничението е ПО ТОКЕН, не по IP. Без доверено прокси `ipClient` връща
  // „diretto" за всички и споделеният ключ означава един общ таван за цялата
  // инсталация — щом интерфейсът започне да подновява сесии (а сега го прави),
  // това е отказ на услуга още при десетина едновременни потребители.
  if (!consenti(`refresh:${hashRefresh(token)}`, LIMITI.refresh, LIMITI.finestraMs))
    return errore(429, "Troppe richieste: riprovare più tardi");
  const ip = ipClient(req.headers);
  if (ip !== "diretto" && !consenti(`refresh-ip:${ip}`, LIMITI.refresh * 10, LIMITI.finestraMs))
    return errore(429, "Troppe richieste: riprovare più tardi");

  const utente = await prisma.user.findFirst({
    where: { refreshToken: hashRefresh(token), attivo: true },
  });
  if (!utente) {
    await cancellaCookieSessione();
    return errore(401, "Sessione scaduta");
  }

  const { token: nuovo, hash } = generaRefreshToken();
  await prisma.user.update({
    where: { id: utente.id },
    data: { refreshToken: hash },
  });

  const sessione: Sessione = {
    sub: utente.id,
    ruolo: utente.ruolo as Ruolo,
    nome: `${utente.nome} ${utente.cognome}`,
    tenantId: utente.tenantId,
  };
  await scriviCookieSessione(await creaAccessToken(sessione), nuovo);
  return ok({ ok: true });
});
