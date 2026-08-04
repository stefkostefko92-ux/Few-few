import "server-only";

import type { ParsedIp } from "@/lib/ip";
import { fetchJson, runSource, type SourceResult } from "./base";
import { rdapBaseFor } from "./rdap-bootstrap";

/**
 * RDAP — официалният наследник на WHOIS.
 *
 * Отиваме ПРАВО при регистъра, който стопанисва блока (RIPE, ARIN, APNIC,
 * LACNIC, AFRINIC), намерен през bootstrap файла на IANA. Отговорът е JSON по
 * RFC 9083 — за разлика от WHOIS, който е свободен текст с различен формат при
 * всеки регистър.
 *
 * ЦЯЛОТО съдържание тук е външно и НЕДОВЕРЕНО: разбираме го отбранително, не
 * вярваме на нито един тип, и нищо от него не се изпълнява — само се показва.
 */

const META = { source: "RDAP (регистърът на адреса)", sourceUrl: "https://about.rdap.org/" };

export interface RdapContact {
  role: string;
  name?: string;
  organisation?: string;
  email?: string;
  phone?: string;
}

export interface RdapNetwork {
  /** Име на мрежата в регистъра (`netname`). */
  name?: string;
  handle?: string;
  /** Обхватът на блока, както е записан. */
  startAddress?: string;
  endAddress?: string;
  /** Блокът в CIDR запис, ако регистърът го дава. */
  cidr?: string;
  /** Държава по РЕГИСТРАЦИЯ — не е геолокация. Виж бележката по-долу. */
  country?: string;
  /** Тип на разпределението (`ALLOCATED PA`, `ASSIGNED PI`, …). */
  type?: string;
  status?: string[];
  /** Кой регистър отговори. */
  registry?: string;
  registered?: string;
  lastChanged?: string;
  /** Адресът за оплаквания от злоупотреба — най-практичното поле тук. */
  abuse?: RdapContact;
  contacts: RdapContact[];
  remarks: string[];
}

// ── Отбранителен разбор на чужд JSON ──────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * jCard (RFC 7095) е масив в масив: `["vcard", [["fn", {}, "text", "Име"], …]]`.
 * Форматът е неудобен, но е стандартът — затова го разбираме тук веднъж.
 */
function parseVcard(value: unknown): Pick<RdapContact, "name" | "organisation" | "email" | "phone"> {
  const result: Pick<RdapContact, "name" | "organisation" | "email" | "phone"> = {};
  if (!Array.isArray(value) || !Array.isArray(value[1])) return result;

  for (const entry of value[1]) {
    if (!Array.isArray(entry)) continue;
    const key = typeof entry[0] === "string" ? entry[0].toLowerCase() : "";
    const raw = entry[3];
    // Някои полета идват като масив от части (например структурираното `adr`).
    const text = asString(Array.isArray(raw) ? raw.filter(Boolean).join(", ") : raw);
    if (!text) continue;

    if (key === "fn") result.name ??= text;
    else if (key === "org") result.organisation ??= text;
    else if (key === "email") result.email ??= text;
    else if (key === "tel") result.phone ??= text;
  }
  return result;
}

function parseEntities(value: unknown, depth = 0): RdapContact[] {
  if (!Array.isArray(value) || depth > 3) return [];
  const contacts: RdapContact[] = [];

  for (const item of value) {
    const entity = asRecord(item);
    if (!entity) continue;

    const roles = asStringArray(entity.roles);
    const card = parseVcard(entity.vcardArray);
    if (roles.length > 0 && (card.name || card.email || card.organisation)) {
      contacts.push({ role: roles.join(", "), ...card });
    }
    // Контактът за злоупотреби често е вложен в организацията, не на върха.
    contacts.push(...parseEntities(entity.entities, depth + 1));
  }
  return contacts;
}

function eventDate(value: unknown, action: string): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const event = asRecord(item);
    if (asString(event?.eventAction)?.toLowerCase() === action) {
      return asString(event?.eventDate);
    }
  }
  return undefined;
}

function parseRemarks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const remark = asRecord(item);
    const description = asStringArray(remark?.description).join(" ");
    if (description) out.push(description.slice(0, 600));
  }
  return out.slice(0, 4);
}

/** Регистърът се разпознава по `port43` (`whois.ripe.net` → RIPE NCC). */
function parseRegistry(payload: Record<string, unknown>): string | undefined {
  const port43 = asString(payload.port43)?.toLowerCase() ?? "";
  const known: Record<string, string> = {
    "whois.ripe.net": "RIPE NCC (Европа, Близък изток)",
    "whois.arin.net": "ARIN (Северна Америка)",
    "whois.apnic.net": "APNIC (Азия, Океания)",
    "whois.lacnic.net": "LACNIC (Латинска Америка)",
    "whois.afrinic.net": "AFRINIC (Африка)",
  };
  for (const [host, label] of Object.entries(known)) {
    if (port43.includes(host)) return label;
  }
  return asString(payload.port43);
}

function parseCidr(payload: Record<string, unknown>): string | undefined {
  // Разширението `cidr0` дава блока в CIDR — не всеки регистър го връща.
  const list = payload.cidr0_cidrs;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const first = asRecord(list[0]);
  if (!first) return undefined;
  const prefix = first.v4prefix ?? first.v6prefix;
  const length = first.length;
  if (typeof prefix !== "string" || typeof length !== "number") return undefined;
  return `${prefix}/${length}`;
}

/** Полето `remarks` понякога носи адрес на geofeed файл (RFC 9092). */
export function geofeedUrlFrom(network: RdapNetwork): string | null {
  for (const remark of network.remarks) {
    // Регистърът иска точно този правопис — търсим го така, но допускаме и
    // малки букви, защото на практика се среща и така.
    const match = /geofeed\s+(https:\/\/\S+)/i.exec(remark);
    const url = match?.[1];
    if (url) return url.replace(/[.,;]+$/, "");
  }
  return null;
}

/**
 * Кеш по конкретен адрес.
 *
 * Не е само оптимизация: политиката за допустима употреба на базата на RIPE
 * иска кеширане вместо повторни заявки за един и същ обект и забранява
 * масовото ѝ теглене. Кешират се САМО успешните отговори — грешката трябва да
 * може да се опита пак.
 */
const RDAP_TTL_MS = 6 * 60 * 60 * 1000;
const rdapCache = new Map<string, { value: RdapNetwork; at: number }>();

export async function lookupRdap(ip: ParsedIp): Promise<SourceResult<RdapNetwork>> {
  return runSource(META, async (signal) => {
    const hit = rdapCache.get(ip.normalized);
    if (hit && Date.now() - hit.at < RDAP_TTL_MS) return hit.value;

    const base = await rdapBaseFor(ip);
    const encoded = encodeURIComponent(ip.normalized);
    // Резервният път се ползва само ако bootstrap файлът не е достъпен —
    // `rdap.org` е с лимит 10 заявки/10 s и не бива да е основен.
    const url = base ? `${base}ip/${encoded}` : `https://rdap.org/ip/${encoded}`;

    const payload = await fetchJson<unknown>(url, signal);
    const record = asRecord(payload);
    if (!record) return null;

    const contacts = parseEntities(record.entities);
    const abuse = contacts.find((contact) => contact.role.toLowerCase().includes("abuse"));

    const network: RdapNetwork = {
      name: asString(record.name),
      handle: asString(record.handle),
      startAddress: asString(record.startAddress),
      endAddress: asString(record.endAddress),
      cidr: parseCidr(record),
      country: asString(record.country)?.toUpperCase(),
      type: asString(record.type),
      status: asStringArray(record.status),
      registry: parseRegistry(record),
      registered: eventDate(record.events, "registration"),
      lastChanged: eventDate(record.events, "last changed"),
      abuse,
      // Без дубли — един и същ контакт често се появява на няколко нива.
      contacts: contacts.filter(
        (contact, index, all) =>
          all.findIndex((other) => other.role === contact.role && other.name === contact.name) === index,
      ),
      remarks: parseRemarks(record.remarks),
    };

    if (!network.name && !network.handle && !network.startAddress) return null;

    // Простичко подрязване, за да не расте картата безкрайно при наплив.
    if (rdapCache.size > 5000) rdapCache.clear();
    rdapCache.set(ip.normalized, { value: network, at: Date.now() });
    return network;
  });
}
