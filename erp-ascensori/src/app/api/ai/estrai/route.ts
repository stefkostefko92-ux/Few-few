// Прочита документ и връща полетата на формата.
//
// Маршрутът НЕ записва нищо. Връща предложение, което човек преглежда и приема.
// Това не е предпазливост: моделът греши, а тези полета отиват във фискални и
// нормативни документи. Автоматичен запис би значел система, която сама си
// съчинява данъчни номера.
//
// Какво пази маршрутът, по ред на важност:
//
//   1. Указанието е НАШЕ и се строи от сървърния регистър. Клиентът праща само
//      името на модула — иначе всеки с валидна сесия би ползвал нашия ключ за
//      каквото си иска.
//   2. Документът е ДАННИ. Той идва отвън и може да съдържа текст, писан
//      нарочно да бъде прочетен като команда. Моделът е предупреден, а
//      структурно изходът и без това е безвреден: разбира се като JSON, минава
//      през Zod и се показва на човек.
//   3. Съдържанието НЕ влиза в одита. Записва се ФАКТЪТ на изпращането — кой,
//      кога, кой модул, отпечатък на файла. Одитът се пази десет години; личните
//      данни в него нямат работа.

import { ok, gestito, errore } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { validaAllegato } from "@/lib/allegati/tipi";
import { impronta } from "@/lib/allegati/archivio";
import { configAi } from "@/lib/ai/config";
import { chiedi, estraiJson, ErroreAi } from "@/lib/ai/fornitore";
import { MODULI_AI, moduloValido, istruzione } from "@/lib/ai/moduli";
import { validaEstrazione, campiPerForm } from "@/lib/ai/valida";
import { consenti } from "@/lib/rate-limit";

/**
 * Таван на извикванията.
 *
 * Всяко от тях струва пари и минава през чужда квота. Без таван един заседнал
 * цикъл в браузъра изчерпва месечния бюджет за час — и то мълчаливо.
 */
const LIMITE_ORARIO = Number(process.env.RATE_LIMIT_AI ?? 60);

export const runtime = "nodejs";
// Четенето на сканиран PDF отнема секунди; подразбирането не стига.
export const maxDuration = 60;

export const GET = gestito(async () => {
  // Интерфейсът пита „има ли изобщо AI“, за да не показва бутон, който само
  // ще даде грешка. Отговорът НЕ съдържа ключа — само дали работи и кой е
  // доставчикът, защото това е информация, която потребителят има право да знае.
  await richiedeRuolo("OPERATORE");
  const c = configAi();
  return ok({
    attiva: c.effettivo !== "off",
    fornitore: c.etichettaFornitore,
    moduli: Object.fromEntries(
      Object.entries(MODULI_AI).map(([k, m]) => [
        k,
        { titolo: m.titolo, documentoAtteso: m.documentoAtteso },
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
    return errore(
      429,
      "Troppe letture con l'AI: riprovare fra qualche minuto.",
    );

  const form = await req.formData().catch(() => null);
  if (!form)
    return errore(400, "Richiesta non valida: attesa multipart/form-data");
  const file = form.get("file");
  const modulo = String(form.get("modulo") ?? "");

  if (!(file instanceof File)) return errore(400, "Nessun documento caricato");
  if (!moduloValido(modulo)) return errore(400, "Modulo non previsto");

  const dati = new Uint8Array(await file.arrayBuffer());
  // СЪЩАТА проверка като при прикачените файлове: тип по съдържание, не по
  // разширение. Един списък разрешени формати за целия продукт.
  const esitoFile = validaAllegato(dati, dati.byteLength);
  if ("errore" in esitoFile) return errore(422, esitoFile.errore);

  const m = MODULI_AI[modulo];
  let risposta: string;
  try {
    risposta = await chiedi({
      istruzione: istruzione(m),
      documento: { dati, mimeType: esitoFile.tipo.mime },
    });
  } catch (e) {
    if (e instanceof ErroreAi) throw new ErroreHttp(e.stato, e.message);
    throw e;
  }

  const grezzo = estraiJson(risposta);
  if (grezzo === null)
    return errore(
      502,
      "L'AI non ha restituito dati leggibili. Riprovare, oppure compilare a mano.",
    );

  const { campi, scartati } = validaEstrazione(m.schema, grezzo);

  await scriviAudit({
    azione: "IMPORT",
    entita: "ai_estrazioni",
    entitaId: s.sub,
    // Съдържанието на документа НЕ влиза тук. Отпечатъкът стига, за да се
    // докаже кой файл е бил изпратен, без самият файл да живее в одита.
    dettagli: {
      modulo,
      fornitore: c.etichettaFornitore,
      modello: c.modello,
      sha256: impronta(dati),
      campiEstratti: Object.keys(campi).length,
      campiScartati: scartati.length,
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok({
    campi: campiPerForm(campi),
    scartati,
    fornitore: c.etichettaFornitore,
    // Изричното напомняне пътува заедно с данните: интерфейсът го показва до
    // самите стойности, а не веднъж в настройките.
    avvertenza:
      "Dati letti automaticamente da un documento: verificarli prima di salvare. L'AI può sbagliare.",
  });
});
