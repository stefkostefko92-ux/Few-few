/**
 * Чиста логика за IP адреси — разбор, нормализация и всичко, което САМИЯТ адрес
 * издава, без нито една мрежова заявка.
 *
 * Този модул е сърцевината на продукта: преди да питаме който и да е външен
 * източник, адресът вече казва изненадващо много — версия, специално
 * предназначение (частен/CGNAT/документационен), вграден IPv4 в IPv6 (6to4,
 * Teredo, NAT64, ISATAP), произход на интерфейсния идентификатор (EUI-64 издава
 * MAC адрес и производителя на мрежовата карта). Всичко тук е синхронно,
 * детерминистично и тествано — външните източници могат да падат, това не може.
 *
 * Няма зависимости. Не импортира нищо от Next — ползва се и от сървъра, и от
 * браузъра, и от тестовете.
 */

export type IpVersion = 4 | 6;

export interface ParsedIp {
  version: IpVersion;
  /** Каноничен текст: IPv4 с точки, IPv6 компресиран по RFC 5952 (малки букви). */
  normalized: string;
  /** Пълната, некомпресирана форма (IPv6: 8 групи по 4 знака). */
  expanded: string;
  /** Байтовете на адреса — 4 за IPv4, 16 за IPv6. */
  bytes: number[];
}

/** Безопасно четене на байт (tsconfig е с `noUncheckedIndexedAccess`). */
function at(bytes: readonly number[], i: number): number {
  return bytes[i] ?? 0;
}

// ── Разбор ────────────────────────────────────────────────────────────────

/**
 * Строг разбор на IPv4.
 *
 * Водещите нули се ОТХВЪРЛЯТ нарочно: `010.0.0.1` е осмично „8.0.0.1“ за
 * `inet_aton`, но „10.0.0.1“ за наивен разбор. Точно това разминаване е
 * класическа SSRF/заобикаляне-на-филтър повърхност (CVE-2021-29418 и сродните),
 * затова тук има само една допустима форма.
 */
function parseIpv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

/** Разбор на IPv6, включително `::` и вграден IPv4 в последните 32 бита. */
function parseIpv6(input: string): number[] | null {
  // Зоновият идентификатор (`fe80::1%eth0`) има смисъл само на локалната машина —
  // за публична справка е безсмислен и го отхвърляме, вместо да го игнорираме тихо.
  if (input.includes("%")) return null;

  const halves = input.split("::");
  if (halves.length > 2) return null;

  const groupsToBytes = (text: string, allowV4Tail: boolean): number[] | null => {
    if (text === "") return [];
    const groups = text.split(":");
    const bytes: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i] ?? "";
      const isLast = i === groups.length - 1;
      if (isLast && allowV4Tail && group.includes(".")) {
        const v4 = parseIpv4(group);
        if (!v4) return null;
        bytes.push(...v4);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      const value = parseInt(group, 16);
      bytes.push((value >> 8) & 0xff, value & 0xff);
    }
    return bytes;
  };

  if (halves.length === 1) {
    const bytes = groupsToBytes(halves[0] ?? "", true);
    return bytes && bytes.length === 16 ? bytes : null;
  }

  const head = groupsToBytes(halves[0] ?? "", false);
  const tail = groupsToBytes(halves[1] ?? "", true);
  if (!head || !tail) return null;
  const missing = 16 - head.length - tail.length;
  // `::` трябва да замества поне една група — иначе адресът е просто изписан грешно.
  if (missing < 2) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** Разбира IP адрес в който и да е приет запис. Връща `null` при невалиден вход. */
export function parseIp(input: string): ParsedIp | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 64) return null;

  // Формата от URL (`[2001:db8::1]:443`) — махаме скобите и евентуалния порт.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed);
  const candidate = bracketed?.[1] ?? trimmed;

  if (candidate.includes(":")) {
    const bytes = parseIpv6(candidate);
    if (!bytes) return null;
    return {
      version: 6,
      normalized: formatIpv6(bytes),
      expanded: expandIpv6(bytes),
      bytes,
    };
  }

  const bytes = parseIpv4(candidate);
  if (!bytes) return null;
  const text = bytes.join(".");
  return { version: 4, normalized: text, expanded: text, bytes };
}

// ── Форматиране ───────────────────────────────────────────────────────────

/** Пълна IPv6 форма: осем групи по четири шестнайсетични знака. */
export function expandIpv6(bytes: readonly number[]): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push((((at(bytes, i) << 8) | at(bytes, i + 1)) >>> 0).toString(16).padStart(4, "0"));
  }
  return groups.join(":");
}

/**
 * Каноничен IPv6 запис по RFC 5952: малки букви, без водещи нули, и `::` върху
 * НАЙ-ДЪЛГАТА поредица от нулеви групи (при равенство — най-лявата).
 */
export function formatIpv6(bytes: readonly number[]): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((at(bytes, i) << 8) | at(bytes, i + 1));

  let bestStart = -1;
  let bestLength = 0;
  let start = -1;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === 0) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const length = i - start;
      if (length > bestLength) {
        bestLength = length;
        bestStart = start;
      }
      start = -1;
    }
  }

  const hex = groups.map((g) => g.toString(16));
  // Поредица от ЕДНА нулева група не се съкращава (RFC 5952 §4.2.2) — „::“ там
  // не спестява нищо и прави адреса по-труден за четене.
  if (bestLength < 2) return hex.join(":");

  const head = hex.slice(0, bestStart).join(":");
  const tail = hex.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

// ── CIDR ──────────────────────────────────────────────────────────────────

/** Съдържа ли се адресът в дадения CIDR блок (например `100.64.0.0/10`)? */
export function inCidr(bytes: readonly number[], cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const parsed = network ? parseIp(network) : null;
  if (!parsed || !prefixText) return false;
  if (parsed.bytes.length !== bytes.length) return false;

  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bytes.length * 8) return false;

  const fullBytes = prefix >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (at(bytes, i) !== at(parsed.bytes, i)) return false;
  }
  const remainingBits = prefix & 7;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (at(bytes, fullBytes) & mask) === (at(parsed.bytes, fullBytes) & mask);
}

// ── Специални диапазони ───────────────────────────────────────────────────

export interface SpecialRange {
  cidr: string;
  /** Кратко име на диапазона (българско, за потребителя). */
  name: string;
  /** Защо това има значение за търсещия. */
  note: string;
  /** Документът, който го определя — показваме го, за да е проверимо. */
  rfc: string;
  /** Има ли смисъл изобщо да питаме външни източници за такъв адрес? */
  globallyRoutable: false;
}

/**
 * Регистърът на IANA за специални предназначения (RFC 6890 и наследниците му).
 * Подредбата е от най-тесния към най-широкия блок — първото попадение печели.
 */
const SPECIAL_V4: readonly SpecialRange[] = [
  { cidr: "255.255.255.255/32", name: "Ограничен broadcast", note: "Адрес за разпръскване в локалния сегмент — никога не се маршрутизира.", rfc: "RFC 919", globallyRoutable: false },
  { cidr: "192.0.0.0/24", name: "Служебен блок на IETF", note: "Резервиран за протоколни нужди (например DS-Lite, NAT64 откриване).", rfc: "RFC 6890", globallyRoutable: false },
  { cidr: "192.0.2.0/24", name: "Документационен (TEST-NET-1)", note: "Съществува само в примери и документация — не е нечия истинска мрежа.", rfc: "RFC 5737", globallyRoutable: false },
  { cidr: "192.88.99.0/24", name: "6to4 anycast (отпаднал)", note: "Бивш anycast за 6to4 предаватели; официално изведен от употреба.", rfc: "RFC 7526", globallyRoutable: false },
  { cidr: "198.51.100.0/24", name: "Документационен (TEST-NET-2)", note: "Съществува само в примери и документация.", rfc: "RFC 5737", globallyRoutable: false },
  { cidr: "203.0.113.0/24", name: "Документационен (TEST-NET-3)", note: "Съществува само в примери и документация.", rfc: "RFC 5737", globallyRoutable: false },
  { cidr: "0.0.0.0/8", name: "„Тази мрежа“", note: "Валиден само като източник, преди устройството да е получило адрес.", rfc: "RFC 1122", globallyRoutable: false },
  { cidr: "10.0.0.0/8", name: "Частна мрежа", note: "Вътрешен адрес — милиони различни мрежи по света ползват същия. Не издава кой е зад него.", rfc: "RFC 1918", globallyRoutable: false },
  { cidr: "100.64.0.0/10", name: "CGNAT (споделен адрес)", note: "Операторски NAT — мобилните и част от кабелните оператори слагат хиляди абонати зад един публичен адрес.", rfc: "RFC 6598", globallyRoutable: false },
  { cidr: "127.0.0.0/8", name: "Локална примка (loopback)", note: "Самата машина. `127.0.0.1` е „тук“, не някъде навън.", rfc: "RFC 1122", globallyRoutable: false },
  { cidr: "169.254.0.0/16", name: "Link-local (APIPA)", note: "Машината си е избрала адрес сама, защото DHCP не е отговорил.", rfc: "RFC 3927", globallyRoutable: false },
  { cidr: "172.16.0.0/12", name: "Частна мрежа", note: "Вътрешен адрес — типичен за офис мрежи и Docker.", rfc: "RFC 1918", globallyRoutable: false },
  { cidr: "192.168.0.0/16", name: "Частна мрежа", note: "Вътрешен адрес — това е диапазонът на домашните рутери.", rfc: "RFC 1918", globallyRoutable: false },
  { cidr: "198.18.0.0/15", name: "Тестове на производителност", note: "Запазен за сравнителни тестове на мрежово оборудване.", rfc: "RFC 2544", globallyRoutable: false },
  { cidr: "224.0.0.0/4", name: "Multicast", note: "Групово разпръскване — не е адрес на конкретна машина.", rfc: "RFC 5771", globallyRoutable: false },
  { cidr: "240.0.0.0/4", name: "Запазен за бъдеща употреба", note: "Класът „E“ — никога не е бил пуснат в употреба.", rfc: "RFC 1112", globallyRoutable: false },
];

const SPECIAL_V6: readonly SpecialRange[] = [
  { cidr: "::/128", name: "Неопределен адрес", note: "„Още нямам адрес“ — валиден само като източник при стартиране.", rfc: "RFC 4291", globallyRoutable: false },
  { cidr: "::1/128", name: "Локална примка (loopback)", note: "Самата машина — IPv6 еквивалентът на 127.0.0.1.", rfc: "RFC 4291", globallyRoutable: false },
  { cidr: "::ffff:0:0/96", name: "IPv4 в IPv6 обвивка", note: "IPv4 адрес, записан като IPv6 — двойните стекове го ползват вътрешно.", rfc: "RFC 4291", globallyRoutable: false },
  { cidr: "64:ff9b::/96", name: "NAT64 (публичен префикс)", note: "IPv6 клиент достига IPv4 услуга през преводач.", rfc: "RFC 6052", globallyRoutable: false },
  { cidr: "64:ff9b:1::/48", name: "NAT64 (локален префикс)", note: "Локален преводач IPv6→IPv4.", rfc: "RFC 8215", globallyRoutable: false },
  { cidr: "100::/64", name: "Черна дупка (discard-only)", note: "Трафикът натам се изхвърля нарочно — ползва се при защита от атаки.", rfc: "RFC 6666", globallyRoutable: false },
  { cidr: "2001::/32", name: "Teredo", note: "IPv6 през IPv4 NAT. Самият адрес издава сървъра, публичния IPv4 и порта на клиента.", rfc: "RFC 4380", globallyRoutable: false },
  { cidr: "2001:20::/28", name: "ORCHIDv2", note: "Криптографски идентификатор, не мрежов адрес.", rfc: "RFC 7343", globallyRoutable: false },
  { cidr: "2001:db8::/32", name: "Документационен", note: "Съществува само в примери и документация.", rfc: "RFC 3849", globallyRoutable: false },
  { cidr: "2002::/16", name: "6to4", note: "IPv6 през IPv4 тунел — вграденият IPv4 адрес е видим в самия запис.", rfc: "RFC 3056", globallyRoutable: false },
  { cidr: "3fff::/20", name: "Документационен (нов)", note: "Разширеният документационен блок.", rfc: "RFC 9637", globallyRoutable: false },
  { cidr: "fc00::/7", name: "Уникален локален адрес (ULA)", note: "IPv6 еквивалентът на частните адреси — вътрешна мрежа.", rfc: "RFC 4193", globallyRoutable: false },
  { cidr: "fe80::/10", name: "Link-local", note: "Валиден само в рамките на един мрежов сегмент.", rfc: "RFC 4291", globallyRoutable: false },
  { cidr: "ff00::/8", name: "Multicast", note: "Групово разпръскване — не е адрес на конкретна машина.", rfc: "RFC 4291", globallyRoutable: false },
];

/** Кой специален диапазон покрива адреса, ако изобщо някой. */
export function specialRange(ip: ParsedIp): SpecialRange | null {
  const table = ip.version === 4 ? SPECIAL_V4 : SPECIAL_V6;
  for (const range of table) {
    if (inCidr(ip.bytes, range.cidr)) return range;
  }
  return null;
}

/**
 * Има ли смисъл да питаме RDAP/гео/репутация за този адрес?
 *
 * Пестим не само заявки, но и лъжа: външно API върнало „САЩ“ за `192.168.1.1`
 * е измислица, а не данни.
 */
export function isGloballyRoutable(ip: ParsedIp): boolean {
  return specialRange(ip) === null;
}

// ── Обратен DNS ───────────────────────────────────────────────────────────

/** Името за обратна справка: `in-addr.arpa` за IPv4, `ip6.arpa` за IPv6. */
export function reverseName(ip: ParsedIp): string {
  if (ip.version === 4) {
    return `${[...ip.bytes].reverse().join(".")}.in-addr.arpa`;
  }
  const nibbles: string[] = [];
  for (const byte of ip.bytes) {
    nibbles.push(((byte >> 4) & 0xf).toString(16), (byte & 0xf).toString(16));
  }
  return `${nibbles.reverse().join(".")}.ip6.arpa`;
}

// ── Какво издава самият IPv6 адрес ────────────────────────────────────────

export interface EmbeddedIpv4 {
  /** Механизмът, който е вградил адреса. */
  mechanism: "6to4" | "Teredo" | "NAT64" | "IPv4-mapped" | "ISATAP";
  ipv4: string;
  /** Кратко обяснение на български какво значи находката. */
  explanation: string;
  /** Само за Teredo — публичният порт на клиента след NAT-а. */
  port?: number;
  /** Само за Teredo — адресът на посредника (Teredo сървъра). */
  serverIpv4?: string;
}

/**
 * Вграден IPv4 адрес в IPv6 запис.
 *
 * Това е една от най-подценяваните находки в такъв инструмент: 6to4 и Teredo
 * адресите носят публичния IPv4 на клиента в чист вид, без нито една заявка.
 * При Teredo стойностите са обърнати побитово (RFC 4380 §4) — нарочно, за да не
 * ги пренаписват наивните NAT устройства по пътя.
 */
export function embeddedIpv4(ip: ParsedIp): EmbeddedIpv4 | null {
  if (ip.version !== 6) return null;
  const b = ip.bytes;

  if (inCidr(b, "2002::/16")) {
    return {
      mechanism: "6to4",
      ipv4: [at(b, 2), at(b, 3), at(b, 4), at(b, 5)].join("."),
      explanation: "6to4 тунел: публичният IPv4 адрес на шлюза е записан направо в IPv6 адреса.",
    };
  }

  if (inCidr(b, "2001::/32")) {
    const server = [at(b, 4), at(b, 5), at(b, 6), at(b, 7)].join(".");
    // Портът и клиентският адрес са записани с обърнати битове.
    const port = ((at(b, 10) ^ 0xff) << 8) | (at(b, 11) ^ 0xff);
    const client = [at(b, 12) ^ 0xff, at(b, 13) ^ 0xff, at(b, 14) ^ 0xff, at(b, 15) ^ 0xff].join(".");
    return {
      mechanism: "Teredo",
      ipv4: client,
      port,
      serverIpv4: server,
      explanation: "Teredo тунел: адресът съдържа публичния IPv4 и порта на клиента след NAT, плюс адреса на Teredo сървъра.",
    };
  }

  if (inCidr(b, "64:ff9b::/96")) {
    return {
      mechanism: "NAT64",
      ipv4: [at(b, 12), at(b, 13), at(b, 14), at(b, 15)].join("."),
      explanation: "NAT64: IPv6 клиент достига IPv4 услуга — вграден е адресът на IPv4 услугата.",
    };
  }

  if (inCidr(b, "::ffff:0:0/96")) {
    return {
      mechanism: "IPv4-mapped",
      ipv4: [at(b, 12), at(b, 13), at(b, 14), at(b, 15)].join("."),
      explanation: "IPv4 адрес в IPv6 обвивка — двойните стекове го ползват вътрешно.",
    };
  }

  // ISATAP: интерфейсният идентификатор е `00-00-5e-fe` (или `02-00-5e-fe`),
  // следван от IPv4 адреса на самия интерфейс.
  if (at(b, 9) === 0x00 && at(b, 10) === 0x5e && at(b, 11) === 0xfe && (at(b, 8) === 0x00 || at(b, 8) === 0x02)) {
    return {
      mechanism: "ISATAP",
      ipv4: [at(b, 12), at(b, 13), at(b, 14), at(b, 15)].join("."),
      explanation: "ISATAP: вътрешният IPv4 адрес на машината е вграден в интерфейсния идентификатор.",
    };
  }

  return null;
}

/**
 * Диапазони, в които долните 64 бита НЕ са интерфейсен идентификатор, а носят
 * друга информация (вграден IPv4 адрес, порт) или изобщо не описват машина.
 */
const NO_INTERFACE_ID: readonly string[] = [
  "::/128",
  "::1/128",
  "::ffff:0:0/96",
  "64:ff9b::/96",
  "64:ff9b:1::/48",
  "100::/64",
  "2001::/32",
  "2001:20::/28",
  "ff00::/8",
];

export interface InterfaceIdentifier {
  kind: "eui64" | "isatap" | "low-byte" | "opaque";
  label: string;
  detail: string;
  /** MAC адресът, ако адресът е построен по EUI-64. */
  mac?: string;
  /** Първите три октета на MAC-а — производителят на мрежовата карта. */
  oui?: string;
}

/**
 * Произходът на долните 64 бита на IPv6 адрес.
 *
 * Старият SLAAC (RFC 4291) вгражда MAC адреса на картата, като вмъква `ff:fe` в
 * средата и обръща U/L бита. Това означава, че такъв адрес издава производителя
 * на хардуера и остава един и същ, дори когато машината смени мрежата. Точно
 * заради това съвременните системи по подразбиране ползват временни адреси
 * (RFC 8981) — и това също е находка, която си струва да покажем.
 */
export function interfaceIdentifier(ip: ParsedIp): InterfaceIdentifier | null {
  if (ip.version !== 6) return null;
  const b = ip.bytes;
  // Изключваме САМО диапазоните, в които долните 64 бита значат нещо друго
  // (вграден IPv4, порт, групов адрес). „Специален“ сам по себе си не е причина:
  // документационните, ULA и link-local адресите си имат нормален интерфейсен
  // идентификатор и анализът върху тях е верен.
  if (NO_INTERFACE_ID.some((cidr) => inCidr(b, cidr))) return null;

  if (at(b, 9) === 0x00 && at(b, 10) === 0x5e && at(b, 11) === 0xfe && (at(b, 8) === 0x00 || at(b, 8) === 0x02)) {
    return {
      kind: "isatap",
      label: "ISATAP идентификатор",
      detail: "Интерфейсният идентификатор е генериран от ISATAP и съдържа IPv4 адрес.",
    };
  }

  if (at(b, 11) === 0xff && at(b, 12) === 0xfe) {
    // U/L битът е обърнат при вграждането — обръщаме го обратно, за да получим
    // истинския MAC адрес на картата.
    const octets = [at(b, 8) ^ 0x02, at(b, 9), at(b, 10), at(b, 13), at(b, 14), at(b, 15)];
    const mac = octets.map((o) => o.toString(16).padStart(2, "0")).join(":");
    return {
      kind: "eui64",
      label: "EUI-64 (издава MAC адрес)",
      detail:
        "Адресът е построен от хардуерния MAC адрес на мрежовата карта. Такъв адрес следва устройството между мрежите и издава производителя на картата.",
      mac,
      oui: mac.slice(0, 8).toUpperCase(),
    };
  }

  const lastEight = b.slice(8);
  const nonZero = lastEight.filter((byte) => byte !== 0).length;
  if (nonZero <= 2 && at(b, 15) !== 0) {
    return {
      kind: "low-byte",
      label: "Ръчно зададен идентификатор",
      detail:
        "Долните битове са почти нула (например `::1`, `::53`) — типично за ръчно конфигуриран сървър, не за клиентска машина.",
    };
  }

  return {
    kind: "opaque",
    label: "Непрозрачен идентификатор",
    detail:
      "Долните 64 бита изглеждат случайни — временен адрес за поверителност (RFC 8981) или стабилен непрозрачен идентификатор (RFC 7217). Не издава хардуера.",
  };
}

// ── Помощни ───────────────────────────────────────────────────────────────

/**
 * Търсенето може да е и домейн — тогава първо резолвваме, после търсим адреса.
 * Тук само разпознаваме формата (без мрежа), за да знае интерфейсът какво прави.
 */
export function looksLikeHostname(input: string): boolean {
  const value = input.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253) return false;
  if (parseIp(value)) return false;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}

/** Каноничен път на страницата за адрес — IPv6 се пише в компресиран вид. */
export function ipPath(ip: ParsedIp): string {
  return `/${encodeURIComponent(ip.normalized)}`;
}
