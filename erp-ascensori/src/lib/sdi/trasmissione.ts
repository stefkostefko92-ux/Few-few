// Подаването на фактурата към Sistema di Interscambio.
//
// ГРАНИЦАТА, КОЯТО ТОЗИ ФАЙЛ ПАЗИ. Продуктът ИЗГОТВЯ файла; той не го подписва.
// Квалифицираният електронен подпис (CAdES/XAdES) иска смарт карта или HSM в
// ръцете на законния представител на фирмата — сървър, който подписва вместо
// него, би държал средството за подписване на трето лице. Затова тук няма и
// няма да има подписване; има ПРЕДАВАНЕ на вече готов файл.
//
// ЗАЩО ИЗОБЩО АДАПТЕР, А НЕ ПРЯКО ИЗВИКВАНЕ. Каналите към SDI са няколко и
// клиентът вече има един от тях: PEC към `sdi01@pec.fatturapa.it`, посредник
// (commercialista или доставчик), или собствен акредитиран канал. Продукт,
// който налага един канал, е продукт, който не се купува. Затова каналът е
// сменяем, а всичко около него — номерация, идемпотентност, следа — е общо.
//
// КАКВО ГАРАНТИРА СЛОЯТ, НЕЗАВИСИМО ОТ КАНАЛА:
//
//   1. ЕДИН ФАЙЛ СЕ ПОДАВА ВЕДНЪЖ. SDI отхвърля повторно име като дубликат
//      независимо от съдържанието — а повторното подаване след мрежова грешка
//      е най-обикновеното нещо на света.
//   2. ФАКТЪТ НА ПОДАВАНЕТО СЕ ЗАПИСВА ПРЕДИ ОТГОВОРА. Обратното значи, че
//      прекъсване по средата оставя фактура, за която системата не знае, че е
//      тръгнала.
//   3. НЕУСПЕХЪТ Е СЪСТОЯНИЕ, НЕ ИЗКЛЮЧЕНИЕ. „Не тръгна" се вижда в списъка и
//      се пробва пак; не изчезва в лог, който никой не чете.
//
// И ЕДНО ЧЕСТНО ОГРАНИЧЕНИЕ, КОЕТО СТОИ В КОДА, НЕ САМО В КОМЕНТАР:
// `CANALI_IMPLEMENTATI` е ПРАЗЕН. Никой канал още няма реален изпращач, затова
// маршрутът за подаване отказва вместо да отбележи фактурата като тръгнала.

import { nomeHostSospetto } from "@/lib/rete";

/** Каналите, които продуктът разпознава. */
export type Canale =
  /** Изключено: файлът се сваля и се подава на ръка. Подразбирането. */
  | "manuale"
  /** Сертифицирана поща към адреса на SDI. */
  | "pec"
  /** Посредник по HTTPS (commercialista или доставчик). */
  | "intermediario";

export interface ConfigTrasmissione {
  canale: Canale;
  /** PEC: адресът на SDI. Различен за първото и следващите подавания. */
  destinatarioPec?: string | null;
  /** Посредник: базовият адрес. Задължително HTTPS (SSRF). */
  urlIntermediario?: string | null;
  /** Етикет за човека — никога тайната. */
  etichetta: string;
}

/**
 * Адресът на SDI за първото подаване по PEC.
 *
 * Той е ЕДИН и е публично известен. След първото подаване SDI отговаря от друг
 * адрес и следващите писма отиват на НЕГО — затова адресът е конфигурируем, а
 * това тук е само подразбирането.
 */
export const PEC_SDI_PRIMO_INVIO = "sdi01@pec.fatturapa.it";

const CANALI: readonly Canale[] = ["manuale", "pec", "intermediario"];

/**
 * Каналите, зад които стои РЕАЛЕН изпращач.
 *
 * ПРАЗЕН НАРОЧНО, И ТОВА Е ЧЕСТНАТА СТОЙНОСТ ДНЕС. Слоят подготвя файла и
 * държи номерацията, но нищо в продукта не праща PEC и не вика посредник —
 * `postEsterno` се вика само от известията. Докато е така, маршрутът за
 * подаване НЕ бива да отбелязва фактурата като подадена: фактура, която
 * системата смята за тръгнала, а не е, е НЕИЗДАДЕНА за данъчната
 * администрация (чл. 6, ал. 1 D.Lgs. 471/1997 — 70 % от данъка, минимум 300 €
 * на операция), и клиентът го открива месеци по-късно.
 *
 * Щом изпращач влезе, името му се добавя тук — в същия комит, в който влиза.
 */
export const CANALI_IMPLEMENTATI: readonly Canale[] = [];

export function canaleImplementato(c: Canale): boolean {
  return CANALI_IMPLEMENTATI.includes(c);
}

function canaleValido(v: string): v is Canale {
  return (CANALI as readonly string[]).includes(v);
}

/**
 * Конфигурацията от средата.
 *
 * Подразбирането е ИЗКЛЮЧЕНО. Продукт, който сам започва да подава фактури,
 * защото някой е попълнил променлива, е продукт, който издава документи без
 * да е питан.
 */
export function configTrasmissione(
  env: Record<string, string | undefined> = process.env,
): ConfigTrasmissione {
  const richiesto = String(env.SDI_CANALE ?? "manuale").trim();
  const canale: Canale = canaleValido(richiesto) ? richiesto : "manuale";

  if (canale === "pec")
    return {
      canale,
      destinatarioPec:
        String(env.SDI_PEC_DESTINATARIO ?? "").trim() || PEC_SDI_PRIMO_INVIO,
      etichetta: "PEC",
    };
  if (canale === "intermediario")
    return {
      canale,
      urlIntermediario: String(env.SDI_INTERMEDIARIO_URL ?? "").trim() || null,
      etichetta: "Intermediario",
    };
  return { canale: "manuale", etichetta: "Manuale (download)" };
}

export interface Invio {
  nomeFile: string;
  xml: string;
  /** Само за съобщението към човека. */
  numeroFattura: string;
}

/**
 * Проверките, които важат за ВСЕКИ канал.
 *
 * Изнесени отделно, за да не се повтарят във всяка реализация — и за да носят
 * тестове. Каналът може да е изключен, но проверките на входа се правят и
 * тогава: включването утре не бива да отваря дупки, които днес никой не е
 * тествал.
 */
export function controllaInvio(
  invio: Invio,
  cfg: ConfigTrasmissione,
): string[] {
  const problemi: string[] = [];

  if (!invio.nomeFile.trim()) problemi.push("Nome file mancante.");
  // Името е ключът за идемпотентност в SDI: повторно име = отхвърлен дубликат.
  else if (!/^IT[A-Z0-9]{11,16}_[A-Z0-9]{5}\.xml$/i.test(invio.nomeFile))
    problemi.push(
      `Nome file non conforme alle regole di denominazione dello SdI: ${invio.nomeFile}`,
    );

  if (!invio.xml.trim()) problemi.push("XML vuoto.");
  else if (!invio.xml.includes("<p:FatturaElettronica"))
    problemi.push("Il contenuto non è una fattura elettronica.");

  if (cfg.canale === "pec") {
    const dest = String(cfg.destinatarioPec ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(dest))
      problemi.push("Indirizzo PEC del destinatario non valido.");
  }

  if (cfg.canale === "intermediario") {
    const url = String(cfg.urlIntermediario ?? "").trim();
    if (!url) problemi.push("URL dell'intermediario non configurato.");
    else {
      let u: URL | null = null;
      try {
        u = new URL(url);
      } catch {
        problemi.push("URL dell'intermediario non valido.");
      }
      // HTTPS и НЕ вътрешен адрес: маршрутът праща фискален документ по адрес
      // от конфигурацията, тоест е класически SSRF, ако не се провери.
      if (u && u.protocol !== "https:")
        problemi.push("L'URL dell'intermediario deve essere HTTPS.");
      if (u && nomeHostSospetto(u.hostname))
        problemi.push(
          "L'URL dell'intermediario punta a un indirizzo interno: non ammesso.",
        );
    }
  }

  return problemi;
}
