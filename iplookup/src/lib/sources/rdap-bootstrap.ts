import "server-only";

import { CidrSet } from "@/lib/cidr-set";
import type { ParsedIp } from "@/lib/ip";
import { cached, fetchText } from "./cache";

/**
 * Кой регистър стопанисва даден адрес — по официалния bootstrap на IANA
 * (RFC 9224), не по чуждо пренасочване.
 *
 * Алтернативата (`rdap.org`) е удобна, но е и единична точка на отказ, и е с
 * лимит от 10 заявки на 10 секунди — тоест при най-лекия наплив продуктът спира
 * да работи по причина извън нас. Bootstrap файлът е статичен, сваля се веднъж
 * дневно и след това всяка справка отива ПРАВО при RIPE/ARIN/APNIC/LACNIC/
 * AFRINIC. `rdap.org` остава само като резервен път.
 */

const BOOTSTRAP_V4 = "https://data.iana.org/rdap/ipv4.json";
const BOOTSTRAP_V6 = "https://data.iana.org/rdap/ipv6.json";
const TTL_MS = 24 * 60 * 60 * 1000;

/** `{ services: [ [ ["1.0.0.0/8", …], ["https://rdap.apnic.net/"] ], … ] }` */
interface BootstrapFile {
  services?: unknown;
}

function buildSet(text: string): CidrSet<string[]> {
  const parsed = JSON.parse(text) as BootstrapFile;
  const services = Array.isArray(parsed.services) ? parsed.services : [];
  const entries: { cidr: string; value: string[] }[] = [];

  for (const service of services) {
    if (!Array.isArray(service)) continue;
    const [prefixes, urls] = service;
    if (!Array.isArray(prefixes) || !Array.isArray(urls)) continue;
    const bases = urls.filter(
      (url): url is string => typeof url === "string" && url.startsWith("https://"),
    );
    if (bases.length === 0) continue;
    for (const prefix of prefixes) {
      if (typeof prefix === "string") entries.push({ cidr: prefix, value: bases });
    }
  }
  return new CidrSet(entries);
}

async function loadSet(version: 4 | 6): Promise<CidrSet<string[]> | null> {
  const url = version === 4 ? BOOTSTRAP_V4 : BOOTSTRAP_V6;
  const result = await cached(`rdap-bootstrap-v${version}`, TTL_MS, async (signal) =>
    buildSet(await fetchText(url, signal)),
  );
  return result?.value ?? null;
}

/**
 * Основният RDAP адрес за този IP, или `null` ако bootstrap-ът е недостъпен.
 * Връща се с завършваща наклонена черта, каквато е конвенцията в файла.
 */
export async function rdapBaseFor(ip: ParsedIp): Promise<string | null> {
  const set = await loadSet(ip.version);
  const match = set?.match(ip.bytes);
  const base = match?.value[0];
  if (!base) return null;
  return base.endsWith("/") ? base : `${base}/`;
}
