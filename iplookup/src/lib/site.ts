/**
 * Единен източник за издателя, домейна и правните данни. Ползва се от
 * импресума, футъра, правните страници и структурираните данни (JSON-LD), за да
 * не се разминават никъде.
 */

export const SITE_URL = "https://iplookup.carbonstealth.eu";

export const SITE_NAME = "Карбон IP";

export const SITE_TAGLINE = "Пълна справка за IP адрес — честно за това какво данните могат и НЕ могат да кажат";

/** Издателят. Данните са на Carbon Stealth VCC, както са публикувани на carbonstealth.eu. */
export const PUBLISHER = {
  legalName: "Carbon Stealth VCC",
  url: "https://carbonstealth.eu",
  eik: "208725180",
  vat: "BG208725180",
  email: "privacy@carbonstealth.eu",
  emailGeneral: "info@carbonstealth.eu",
  phone: "+359 877 414 874",
  address: {
    street: "ул. „Самуил“ № 3",
    locality: "Бобов дол",
    region: "Кюстендил",
    postalCode: "2670",
    country: "България",
    countryCode: "BG",
  },
} as const;

export const ADDRESS_ONE_LINE = `${PUBLISHER.address.street}, гр. ${PUBLISHER.address.locality} ${PUBLISHER.address.postalCode}, обл. ${PUBLISHER.address.region}, ${PUBLISHER.address.country}`;

/**
 * Ключовите думи на продукта. Правило на репото: поне пет, и „Carbon Stealth“
 * винаги е една от тях.
 */
export const KEYWORDS = [
  "IP адрес",
  "проверка на IP адрес",
  "какъв е моят IP адрес",
  "IP lookup",
  "WHOIS справка",
  "RDAP",
  "ASN справка",
  "обратен DNS",
  "Tor изходен възел",
  "Карбон IP",
  "Carbon Stealth",
  "Carbon Stealth VCC",
];

/**
 * Източниците, които стоят зад справката — показваме ги на потребителя.
 * Част от лицензите изискват изричен кредит; той се дава тук и във футъра.
 */
export const DATA_SOURCES = [
  {
    name: "RDAP на регионалните регистри",
    url: "https://about.rdap.org/",
    note: "Официалният наследник на WHOIS. Питаме директно RIPE/ARIN/APNIC/LACNIC/AFRINIC през bootstrap файла на IANA.",
  },
  {
    name: "Team Cymru IP-to-ASN",
    url: "https://team-cymru.com/community-services/ip-asn-mapping/",
    note: "Кой маршрутизира адреса — автономна система и обявен префикс.",
  },
  {
    name: "Geofeed на операторите (RFC 8805)",
    url: "https://www.rfc-editor.org/rfc/rfc8805.html",
    note: "Местоположение, обявено от самия оператор на мрежата — най-достоверният геоизточник.",
  },
  {
    name: "Публични диапазони на AWS, Google Cloud, Cloudflare, Fastly, Googlebot и Apple Private Relay",
    url: "https://ip-ranges.amazonaws.com/ip-ranges.json",
    note: "Списъци, публикувани от самите доставчици.",
  },
  {
    name: "Списък на изходните възли на Tor",
    url: "https://check.torproject.org/torbulkexitlist",
    note: "Поддържан от The Tor Project.",
  },
  {
    name: "Spamhaus DROP",
    url: "https://www.spamhaus.org/blocklists/do-not-route-or-peer/",
    note: "© The Spamhaus Project. Ползва се с изричен кредит, както изискват условията.",
  },
] as const;
