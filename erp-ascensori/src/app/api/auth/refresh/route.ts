// Подновяване на сесията: валиден refresh token (сравнен по хеш) → нов access
// + РОТАЦИЯ на refresh token-а. Невалиден/нулиран token → 401. Вече ротиран
// token, подаден отново след прозореца за паралелни табове → кражба: всички
// сесии на потребителя падат.

import { cookies } from "next/headers";
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
import {
  trovaSessione,
  ruotaSessione,
  sessioneDaTokenPrecedente,
  revocaTutte,
} from "@/lib/sessioni";
import { scriviAudit } from "@/lib/audit";
import { log } from "@/lib/log";

/** Колко дълго старият токен е „паралелен таб", а не кражба. */
const GRAZIA_MS = Number(process.env.REFRESH_GRAZIA_MS ?? 20_000);

export const POST = gestito(async (req) => {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!token) return errore(401, "Sessione scaduta");

  // Ограничението е ПО ТОКЕН, не по IP. Без доверено прокси `ipClient` връща
  // „diretto" за всички и споделеният ключ означава един общ таван за цялата
  // инсталация — щом интерфейсът започне да подновява сесии (а сега го прави),
  // това е отказ на услуга още при десетина едновременни потребители.
  if (
    !consenti(
      `refresh:${hashRefresh(token)}`,
      LIMITI.refresh,
      LIMITI.finestraMs,
    )
  )
    return errore(429, "Troppe richieste: riprovare più tardi");
  const ip = ipClient(req.headers);
  if (
    ip !== "diretto" &&
    !consenti(`refresh-ip:${ip}`, LIMITI.refresh * 10, LIMITI.finestraMs)
  )
    return errore(429, "Troppe richieste: riprovare più tardi");

  // Сесията се търси в собствената си таблица: така всяко устройство има
  // свой ред и подновяването на едното не сваля другото.
  const sess = await trovaSessione(token);
  if (!sess) {
    // ПОВТОРНА УПОТРЕБА. Токенът не е текущият, но е бил текущ преди
    // последната ротация. Щом законният клиент вече държи новия, старият е у
    // някой друг — отменяме цялата сесия (RFC 6819 § 5.2.2.3).
    //
    // С изключение на кратък прозорец: два таба подновяват едновременно,
    // единият печели, другият носи стария токен. Там НЕ отменяме и НЕ даваме
    // нови бисквитки — табът просто ползва вече обновените.
    const precedente = await sessioneDaTokenPrecedente(token);
    if (precedente) {
      const eta = Date.now() - (precedente.ruotataAt?.getTime() ?? 0);
      if (eta < GRAZIA_MS) return ok({ ok: true, giaRinnovata: true });
      await revocaTutte(precedente.utenteId);
      await scriviAudit({
        azione: "STATE_CHANGE",
        entita: "sessioni_attive",
        entitaId: precedente.id,
        dettagli: { valori: { sessione: { a: "revocata-riuso-token" } } },
        utenteId: precedente.utenteId,
        tenantId: precedente.utente.tenantId,
      });
      log.warn("refresh token riutilizzato: sessioni revocate", {
        utente_id: precedente.utenteId,
      });
    }
    await cancellaCookieSessione();
    return errore(401, "Sessione scaduta");
  }
  if (!sess.utente.attivo) {
    await cancellaCookieSessione();
    return errore(401, "Sessione scaduta");
  }
  const utente = sess.utente;

  const { token: nuovo } = generaRefreshToken();
  // Ротация НА МЯСТО: същият ред получава новия хеш. Открадната стара стойност
  // престава да работи веднага, а списъкът с устройства не расте при всяко
  // подновяване. Условна: паралелното подновяване със същия токен губи.
  if (!(await ruotaSessione(sess.id, token, nuovo)))
    return ok({ ok: true, giaRinnovata: true });

  const sessione: Sessione = {
    sub: utente.id,
    ruolo: utente.ruolo as Ruolo,
    nome: `${utente.nome} ${utente.cognome}`,
    tenantId: utente.tenantId,
    sid: sess.id,
  };
  await scriviCookieSessione(await creaAccessToken(sessione), nuovo);
  return ok({ ok: true });
});
