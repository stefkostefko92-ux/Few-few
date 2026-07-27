// Съставя текст от бележка на оператора. НЕ записва нищо.
//
// Близнак на `/api/ai/estrai` и нарочно със същата форма: същото ниво на
// достъп, същият таван на извикванията, същият одит без съдържание. Разликата
// е в посоката — там документ влиза и полета излизат, тук бележка влиза и
// изречение излиза.
//
// Какво пази маршрутът:
//
//   1. **Указанието е НАШЕ.** Клиентът праща името на задачата от сървърния
//      регистър (`COMPITI_TESTO`) и суровата си бележка. Никога роля, никога
//      правила: иначе ключът на фирмата върши произволна работа за нейна сметка.
//   2. **Бележката е ДАННИ.** Влиза между ограждения, които не може да затвори
//      (`pulisci`), и моделът е предупреден изрично.
//   3. **Съдържанието НЕ влиза в одита.** Записва се фактът: кой, кога, коя
//      задача, колко знака. Одитът се пази до десет години — текст на клиент
//      няма работа в него.
//   4. **Изходът е предложение.** Връща се на екрана, човек решава.

import { ok, gestito, errore } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { configAi } from "@/lib/ai/config";
import { chiedi, ErroreAi } from "@/lib/ai/fornitore";
import {
  COMPITI_TESTO,
  compitoValido,
  istruzioneTesto,
  ripulisciRisposta,
  MAX_INGRESSO,
} from "@/lib/ai/testo";
import { consenti } from "@/lib/rate-limit";

/**
 * Един бюджет с извличането, не два.
 *
 * Ключът на кофата е `ai:<utente>` — същият, който ползва `/api/ai/estrai`.
 * Отделен таван тук би значел, че операторът може да похарчи двойно, докато
 * сметката идва при собственика с едно число.
 */
const LIMITE_ORARIO = Number(process.env.RATE_LIMIT_AI ?? 60);

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = gestito(async () => {
  await richiedeRuolo("OPERATORE");
  const c = configAi();
  return ok({
    attiva: c.effettivo !== "off",
    fornitore: c.etichettaFornitore,
    compiti: Object.fromEntries(
      Object.entries(COMPITI_TESTO).map(([k, v]) => [
        k,
        { titolo: v.titolo, ingressoAtteso: v.ingressoAtteso },
      ]),
    ),
  });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const c = configAi();
  if (c.effettivo === "off")
    return errore(
      503,
      "Assistente AI non configurato. Va abilitato dall'amministratore di sistema (variabili AI_PROVIDER e AI_API_KEY).",
    );

  if (!consenti(`ai:${s.sub}`, LIMITE_ORARIO, 60 * 60_000))
    return errore(429, "Troppe richieste all'AI: riprovare fra qualche minuto.");

  const corpo = (await req.json().catch(() => null)) as {
    compito?: unknown;
    appunti?: unknown;
  } | null;
  if (!corpo) return errore(400, "Richiesta non valida: atteso JSON");

  const compito = String(corpo.compito ?? "");
  const appunti = typeof corpo.appunti === "string" ? corpo.appunti : "";

  if (!compitoValido(compito)) return errore(400, "Compito non previsto");
  if (appunti.trim().length < 3)
    return errore(
      422,
      "Servono almeno alcune parole di appunti: senza di esse il testo sarebbe inventato.",
    );
  if (appunti.length > MAX_INGRESSO)
    return errore(
      413,
      `Appunti troppo lunghi: massimo ${MAX_INGRESSO} caratteri.`,
    );

  const t = COMPITI_TESTO[compito];
  let risposta: string;
  try {
    risposta = await chiedi({
      istruzione: istruzioneTesto(t, appunti),
      formato: "testo",
      maxToken: t.maxToken,
    });
  } catch (e) {
    if (e instanceof ErroreAi) throw new ErroreHttp(e.stato, e.message);
    throw e;
  }

  const testo = ripulisciRisposta(risposta);
  if (!testo)
    return errore(
      502,
      "L'AI non ha restituito un testo utilizzabile. Riprovare, oppure scrivere a mano.",
    );

  await scriviAudit({
    azione: "IMPORT",
    entita: "ai_testi",
    entitaId: s.sub,
    // Нито бележката, нито изходът. Само мярката — тя стига за сметката и за
    // доказване на употребата, без да прави одита хранилище за текстове.
    dettagli: {
      compito,
      fornitore: c.etichettaFornitore,
      modello: c.modello,
      caratteriIngresso: appunti.length,
      caratteriUscita: testo.length,
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok({
    testo,
    fornitore: c.etichettaFornitore,
    avvertenza:
      "Testo proposto da un modello linguistico: rileggerlo prima di salvare. Il documento resta di chi lo firma.",
  });
});
