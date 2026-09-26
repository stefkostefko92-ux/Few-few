// Вход: bcrypt проверка, брояч на неуспехите (5 → 15 мин блокада — ЕДНА за
// паролата и за втория фактор), честота по акаунт и по IP, таван на
// едновременните bcrypt, еднакъв отговор за непознат имейл, TOTP без повторна
// употреба, JWT access + refresh token (хеш в базата), audit LOGIN.

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, errore, corpoValidato, gestito } from "@/lib/api";
import {
  consenti,
  incrementa,
  puliziaSeNecessaria,
  LIMITI,
} from "@/lib/rate-limit";
import { ipClient } from "@/lib/ip-client";
import {
  eBloccato,
  registraFallimento,
  registraSuccesso,
  BLOCCO_MINUTI,
  MAX_TENTATIVI,
} from "@/lib/lockout";
import {
  creaAccessToken,
  generaRefreshToken,
  scriviCookieSessione,
  type Sessione,
} from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import type { Ruolo } from "@/lib/roles";
import { passoValido, passoNuovo } from "@/lib/totp";
import { consumaCodiceRecupero } from "@/lib/mfa";
import { apriSessione } from "@/lib/sessioni";
import {
  accessoBloccatoSenzaMfa,
  passwordScaduta,
} from "@/lib/password-policy";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  /** Код от приложението за втори фактор или резервен код. */
  codice: z.string().trim().max(20).optional(),
});

/**
 * Фиктивен хеш със СЪЩАТА цена като истинските (10 кръга).
 *
 * Сравнението срещу него изгаря същото време при непознат имейл. Преди тук
 * стоеше ръчно написан низ: ако bcrypt го сметне за невалиден, сравнението
 * свършва за микросекунди и времето на отговора издава кой имейл съществува.
 */
const HASH_FITTIZIO = bcrypt.hashSync(randomBytes(16).toString("hex"), 10);

/**
 * Колко bcrypt сравнения вървят едновременно.
 *
 * bcrypt е скъп НАРОЧНО (~70 ms CPU). Без таван поток от входове — дори с
 * грешни пароли — изяжда процесора и сваля гестионала за всички. Излишъкът
 * получава 429 веднага, вместо да чака на опашка, която само расте.
 */
const MAX_BCRYPT_PARALLELI = 8;
let bcryptInCorso = 0;

async function confronta(password: string, hash: string): Promise<boolean> {
  bcryptInCorso++;
  try {
    return await bcrypt.compare(password, hash);
  } finally {
    bcryptInCorso--;
  }
}

const bloccato = () =>
  errore(
    423,
    `Account bloccato per ${BLOCCO_MINUTI} minuti dopo troppi tentativi`,
  );

/**
 * ЕДИН път за всеки неуспех — грешна парола, грешен код, повторен код.
 *
 * Преди грешният втори фактор само увеличаваше брояча и НИКОГА не записваше
 * блокада: щом паролата е известна, 6-цифреният код се налучкваше без край
 * (ограничен само от честотата в паметта). Сега всеки неуспех води към една и
 * съща блокада 5/15 мин.
 */
async function fallimento(
  utenteId: string,
  ora: Date,
  messaggio: string,
): Promise<ReturnType<typeof errore>> {
  // АТОМАРНО увеличение: чети-смятай-пиши позволява загубени обновления —
  // при паралелни опити броячът изостава и блокадата се заобикаля.
  const aggiornato = await prisma.user.update({
    where: { id: utenteId },
    data: { tentativi: { increment: 1 } },
    select: { tentativi: true },
  });
  const esito = registraFallimento(
    { tentativi: aggiornato.tentativi - 1, bloccatoFino: null },
    ora,
  );
  if (esito.bloccato) {
    await prisma.user.update({
      where: { id: utenteId },
      data: { bloccatoFino: esito.bloccatoFino },
    });
    return bloccato();
  }
  return errore(
    401,
    `${messaggio} Tentativi rimasti: ${esito.tentativiRimasti}`,
  );
}

export const POST = gestito(async (req) => {
  puliziaSeNecessaria();
  const {
    email: emailGrezza,
    password,
    codice,
  } = await corpoValidato(req, schema);
  // Една форма на имейла за всичко — ключ на честотата, търсене, брояч.
  // Иначе „Mario@Azienda.it" и „mario@azienda.it " са два отделни тавана за
  // един и същ акаунт.
  const email = emailGrezza.trim().toLowerCase();

  // Ограничението е ПО АКАУНТ, не по IP. Причината: без доверено прокси IP-то
  // не е надеждно (подправя се с хедър), а споделен ключ за всички би дал на
  // всеки анонимен възможност да заключи входа за цялата фирма с 20 заявки.
  // Брутфорсът по един акаунт се лови от блокадата 5/15 мин; това е втори слой.
  if (!consenti(`login:${email}`, LIMITI.login, LIMITI.finestraMs))
    return errore(429, "Troppe richieste: riprovare più tardi");

  // По IP пазим само глобален таван срещу разпръснат брутфорс — много по-висок,
  // за да не може един клиент да откаже услугата на останалите.
  const ip = ipClient(req.headers);
  if (
    ip !== "diretto" &&
    !consenti(`login-ip:${ip}`, LIMITI.login * 10, LIMITI.finestraMs)
  )
    return errore(429, "Troppe richieste: riprovare più tardi");
  if (bcryptInCorso >= MAX_BCRYPT_PARALLELI)
    return errore(429, "Troppe richieste: riprovare più tardi");

  const utente = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // Документацията изисква „indicazione dei tentativi rimanenti prima del blocco"
  // (гл. Protezione degli accessi). За да не издава това кой имейл съществува,
  // НЕПОЗНАТИЯТ имейл получава СЪЩИЯ отговор: брояч, който намалява, и блокада
  // след петия опит — водени в паметта, защото ред в базата няма.
  const ora = new Date();
  if (!utente || !utente.attivo) {
    await confronta(password, HASH_FITTIZIO);
    const n = incrementa(`login-ignoto:${email}`, BLOCCO_MINUTI * 60_000);
    if (n >= MAX_TENTATIVI) return bloccato();
    return errore(
      401,
      `Credenziali non valide. Tentativi rimasti: ${MAX_TENTATIVI - n}`,
    );
  }

  if (
    eBloccato(
      { tentativi: utente.tentativi, bloccatoFino: utente.bloccatoFino },
      ora,
    )
  )
    return bloccato();

  if (!(await confronta(password, utente.password)))
    return fallimento(utente.id, ora, "Credenziali non valide.");

  // ── Втори фактор ────────────────────────────────────────────────────────
  // Проверява се СЛЕД паролата: иначе маршрутът издава кои акаунти имат MFA.
  if (utente.totpAttivo && utente.totpSegreto) {
    if (!codice)
      // Отделен код, за да може интерфейсът да покаже полето, без да третира
      // това като неуспешен вход.
      return errore(428, "Codice di verifica richiesto");

    const passo = passoValido(utente.totpSegreto, codice);
    let okTotp = false;
    if (passoNuovo(passo, utente.totpUltimoPasso)) {
      // Условен запис: два паралелни входа със СЪЩИЯ код — само единият
      // минава. Проверка-после-запис без условие би пропуснала и двата.
      const { count } = await prisma.user.updateMany({
        where: {
          id: utente.id,
          OR: [
            { totpUltimoPasso: null },
            { totpUltimoPasso: { lt: passo as number } },
          ],
        },
        data: { totpUltimoPasso: passo },
      });
      okTotp = count === 1;
    }
    // Резервен код — само ако не е валиден TOTP изобщо (не при повторен).
    const okRecupero =
      okTotp || passo !== null
        ? false
        : await consumaCodiceRecupero(utente.id, codice);
    if (!okTotp && !okRecupero)
      return fallimento(utente.id, ora, "Codice di verifica non valido.");
  }

  // мулти-фирма: неактивна фирма/изтекъл абонамент спират входа
  if (utente.tenantId) {
    const t = await prisma.tenant.findUnique({
      where: { id: utente.tenantId },
    });
    if (!t || !t.attivo) return errore(403, "Azienda disattivata");
    if (t.scadenzaAbbonamento && t.scadenzaAbbonamento < ora)
      return errore(402, "Abbonamento scaduto: contattare l'amministrazione");
  }

  const azzeramento = registraSuccesso();
  const { token: refresh, hash } = generaRefreshToken();
  await prisma.user.update({
    where: { id: utente.id },
    data: { ...azzeramento, ultimoAccesso: ora, refreshToken: hash },
  });
  // Всеки вход отваря СВОЯ сесия: вход от втори компютър вече не изхвърля
  // първия, а списъкът показва откъде е влизано.
  const sid = await apriSessione(utente.id, refresh, {
    userAgent: req.headers.get("user-agent"),
    ip: ip === "diretto" ? null : ip,
  });

  const sessione: Sessione = {
    sub: utente.id,
    ruolo: utente.ruolo as Ruolo,
    nome: `${utente.nome} ${utente.cognome}`,
    tenantId: utente.tenantId,
    sid,
  };
  await scriviCookieSessione(await creaAccessToken(sessione), refresh);
  await scriviAudit({
    azione: "LOGIN",
    entita: "users",
    entitaId: utente.id,
    utenteId: utente.id,
    tenantId: utente.tenantId,
  });

  return ok({
    id: utente.id,
    nome: utente.nome,
    cognome: utente.cognome,
    ruolo: utente.ruolo,
    // Интерфейсът показва подсещане, вместо потребителят да разбере при
    // отказан достъп някъде другаде.
    // Същото правило като в `richiedeRuolo` — иначе интерфейсът води към
    // „Sicurezza" човек, когото сървърът всъщност пуска, или обратното.
    mfaRichiesto: accessoBloccatoSenzaMfa(utente.ruolo, utente.totpAttivo),
    passwordScaduta: passwordScaduta(utente.passwordCambiataAt, ora),
  });
});
