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

import { hostInterno } from "@/lib/rete";

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

export interface EsitoTrasmissione {
  inviato: boolean;
  /** Как е тръгнало — влиза в одита. */
  canale: Canale;
  /** Съобщение за човека, на италиански. */
  messaggio: string;
  /** Идентификатор от канала, ако има (message-id на PEC, id на посредника). */
  riferimento?: string | null;
}

export class ErroreTrasmissione extends Error {
  constructor(
    readonly stato: number,
    message: string,
  ) {
    super(message);
    this.name = "ErroreTrasmissione";
  }
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
    problemi.push(`Nome file non conforme alle regole SDI: ${invio.nomeFile}`);

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
      if (u && indirizzoInterno(u.hostname))
        problemi.push(
          "L'URL dell'intermediario punta a un indirizzo interno: non ammesso.",
        );
    }
  }

  return problemi;
}

/**
 * Вътрешен ли е адресът.
 *
 * Същата проверка като при webhook-ите — и буквално същият код: тя живее в
 * `lib/rete.ts`, защото едно правило за „навън" не бива да има два различни
 * списъка. Без нея конфигурация с `https://169.254.169.254/...` кара сървъра
 * да изпрати фактурата — и всичко останало, до което стигне — на метаданните
 * на облака.
 *
 * Пази се като име, защото се вика от проверката на конфигурацията: там се
 * съди по това, което е ЗАПИСАНО. Самото изпращане минава през `postEsterno`,
 * който проверява резолвния адрес в мига на свързването.
 */
export function indirizzoInterno(hostname: string): boolean {
  return hostInterno(hostname);
}
