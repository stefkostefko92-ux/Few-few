/**
 * Предпазителите около гео базата — чисти, тествани, без файлове и без мрежа.
 *
 * Тези функции съществуват заради едно измерване. DB-IP Lite връща за GPRS пула
 * на Йеттел „Sofia (Rayon Mladost)" — а зад този пул стоят около 2,3 милиона
 * абоната в цялата страна. Базата НИКОГА не казва „не знам": в 2 962 проверени
 * записа нула върнаха държава без град. Тя винаги назовава населено място, дори
 * когато го гадае, и няма поле за радиус на точността.
 *
 * Затова суровият изход от базата не бива да стига до екрана. Тези функции са
 * разликата между инструмент, който помага, и инструмент, по който някой чука
 * на грешна врата.
 *
 * Измервания, на които стъпва решението:
 * · медианна грешка DB-IP: 16 km при фиксирани, **207 km при мобилни**
 *   (arXiv:2605.21937, ground truth от RIPE Atlas и UNICEF Giga, 37 302
 *   наблюдения; DB-IP е най-слабата от четирите изследвани бази);
 * · 36,6% от българското адресно пространство пада в ТРИ точки в София;
 * · дори когато база обявява радиус, 51% от случаите падат извън него.
 */

/** Докъде е защитимо да се твърди. */
export type Granularity = "country" | "city";

/**
 * Какъв е блокът. Определя докъде е защитимо твърдението.
 *
 * `unknown` НЕ е „вероятно фиксирана връзка" — той е „не знаем". И понеже при
 * мобилна връзка грешката е стотици километри, неизвестното се третира като
 * мобилно. Обратната подредба веднъж вече пропусна реален случай: пул на
 * Йеттел, чието име не съдържаше нито „GPRS", нито „mobile", мина за град.
 */
export type NetworkClass = "mobile" | "infrastructure" | "unknown";

export interface GeoClaim {
  country?: string;
  /** Град — само при `granularity === "city"`, и вече изчистен от квартал. */
  city?: string;
  latitude?: number;
  longitude?: number;
  granularity: Granularity;
  /** Защо е свито до държава. Показва се на потребителя дословно. */
  limitedBecause?: string;
  /** Медианна грешка за този клас адреси, в километри. */
  medianErrorKm: number;
}

/**
 * Реже подробността под град.
 *
 * `Sofia (Rayon Mladost)` → `Sofia`. Кварталът е измислица на базата: тя няма
 * откъде да го знае за пул, обслужващ цяла държава, а изписан на екран изглежда
 * като най-точното нещо в справката.
 */
export function stripSubCity(city: string): string {
  return city
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*[-–—]\s*(Rayon|Rajon|Район|District|Okrug|Quarter)\b.*$/i, "")
    .trim();
}

/**
 * Признаци, че блокът е МОБИЛЕН пул.
 *
 * Операторите сами се издават в името и описанието на мрежата: „Mobile Core
 * Network", „GPRS services", „public GPRS/3G". Това не е евристика по
 * съвпадение — това е самопризнание, че зад адреса стои NAT, а не абонат.
 */
const MOBILE_MARKERS = [
  "gprs",
  "3g",
  "4g",
  "lte",
  "umts",
  "mobile",
  "mobil",
  "apn",
  "cellular",
  "gsm",
];

/**
 * Признаци за инфраструктурна мрежа — хостинг, датацентър, облак.
 *
 * Само тук градът значи нещо: сървърът наистина стои в конкретна сграда, а не
 * се движи из страната в нечий джоб.
 */
const INFRASTRUCTURE_MARKERS = [
  "hosting",
  "host",
  "datacenter",
  "datacentre",
  "data center",
  "colo",
  "colocation",
  "server",
  "vps",
  "cloud",
  "cdn",
  "dedicated",
];

function hasMarker(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => {
    // Граница по дума, за да не хване „mobile" вътре в „automobile".
    const pattern = new RegExp(`(^|[^a-z0-9])${marker.replace(/ /g, "[ -]")}([^a-z0-9]|$)`);
    return pattern.test(text);
  });
}

export function looksLikeMobilePool(...haystacks: (string | undefined)[]): boolean {
  return classifyNetwork(...haystacks) === "mobile";
}

/**
 * Класифицира блока по това, което операторът сам е написал в регистъра.
 *
 * Мобилното бие инфраструктурното: „Mobile Core Network" е мобилен пул, дори да
 * съдържа думата „network". Всичко, което не се разпознае, остава `unknown` — и
 * се третира предпазливо, а не оптимистично.
 */
export function classifyNetwork(...haystacks: (string | undefined)[]): NetworkClass {
  const text = haystacks.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "unknown";
  if (hasMarker(text, MOBILE_MARKERS)) return "mobile";
  if (hasMarker(text, INFRASTRUCTURE_MARKERS)) return "infrastructure";
  return "unknown";
}

/**
 * Съотношението абонати към публични адреси при българските мобилни оператори,
 * изчислено от dump-а на RIPE (мобилните пулове по описание) спрямо публично
 * обявения брой абонати. Показваме го, защото едно число обяснява защо „град"
 * е безсмислен по-добре от абзац текст.
 */
export const BG_MOBILE_RATIOS: readonly { operator: string; subscribersPerAddress: number }[] = [
  { operator: "А1", subscribersPerAddress: 1416 },
  { operator: "Виваком", subscribersPerAddress: 855 },
  { operator: "Йеттел", subscribersPerAddress: 642 },
];

/**
 * Свежда суровия отговор на базата до това, което е защитимо да се твърди.
 *
 * Мобилните пулове падат до държава. Не защото базата мълчи — тя охотно дава
 * квартал — а защото зад един такъв адрес стоят стотици до хиляди абонати
 * едновременно и медианната грешка е стотици километри.
 */
export function constrainGeoClaim(raw: {
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  /** Класът на мрежата. `mobilePool: true` се приема като `"mobile"`. */
  networkClass?: NetworkClass;
  mobilePool?: boolean;
}): GeoClaim {
  const kind: NetworkClass = raw.mobilePool ? "mobile" : (raw.networkClass ?? "unknown");

  if (kind === "mobile") {
    return {
      country: raw.country,
      granularity: "country",
      limitedBecause:
        "Блокът е мобилен пул. Зад един такъв адрес стоят стотици до хиляди абонати едновременно (в България между 642 и 1416 на адрес), а медианната грешка на геолокацията при мобилни адреси е около 207 км. Град или квартал тук би бил измислица.",
      medianErrorKm: 207,
    };
  }

  if (kind === "unknown") {
    // Безопасната посока по подразбиране. Ако сгрешим тук, губим подробност;
    // ако сгрешим в другата посока, някой чука на грешна врата.
    return {
      country: raw.country,
      granularity: "country",
      limitedBecause:
        "Не може да се отличи фиксирана от мобилна връзка по данните в регистъра. Ако връзката е мобилна, медианната грешка е около 207 км, затова градът не се показва. Класът се потвърждава от оператора при искането.",
      medianErrorKm: 207,
    };
  }

  const city = raw.city ? stripSubCity(raw.city) : undefined;
  return {
    country: raw.country,
    city: city || undefined,
    latitude: raw.latitude,
    longitude: raw.longitude,
    granularity: city ? "city" : "country",
    medianErrorKm: 16,
  };
}
