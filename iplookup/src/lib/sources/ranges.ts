import "server-only";

import { CidrSet, type CidrEntry } from "@/lib/cidr-set";
import type { ParsedIp } from "@/lib/ip";
import { cached, fetchText } from "./cache";
import type { SourceResult } from "./base";

/**
 * „Що за адрес е това?“ — облак, CDN, обхождащ робот или частен релей.
 *
 * Отговорът идва от списъците, които САМИТЕ доставчици публикуват. Това е
 * важно: платените услуги продават „hosting / proxy“ флаг като предположение, а
 * тук твърдението е проверимо — AWS сам казва кои са неговите блокове. Всички
 * източници са без ключ и разрешени за търговска употреба.
 *
 * Липсата на попадение НЕ значи „жилищна връзка“ — покритието не е пълно.
 * Затова интерфейсът никога не пише „жилищен“ на празен резултат.
 */

const TTL_MS = 12 * 60 * 60 * 1000;

export type ProviderKind = "cloud" | "cdn" | "crawler" | "relay";

export interface ProviderInfo {
  provider: string;
  kind: ProviderKind;
  /** Регион/зона, ако доставчикът го дава. */
  region?: string;
  /** Конкретната услуга (например `S3`, `EC2`). */
  service?: string;
  /** Обявен град — само Apple Private Relay дава това. */
  city?: string;
  /** Обяснение на български какво следва от находката. */
  meaning: string;
}

type Entry = CidrEntry<ProviderInfo>;

/** Един доставчик: адрес, име и как се превръща отговорът в блокове. */
interface Feed {
  id: string;
  url: string;
  parse: (text: string) => Entry[];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
      )
    : [];
}

const CLOUD_MEANING =
  "Адресът е на облачен доставчик — зад него стои сървър, нает от някого, а не домашна или офисна връзка. Разположението показва къде е ЦЕНТЪРЪТ ЗА ДАННИ, не къде е потребителят.";
const CDN_MEANING =
  "Адресът е на мрежа за доставка на съдържание (CDN). Истинският сървър зад него е скрит — този адрес е само входната точка.";
const CRAWLER_MEANING =
  "Адресът принадлежи на обхождащ робот на търсачка. Ако го виждаш в логовете си, това е индексиране, не атака.";
const RELAY_MEANING =
  "Адресът е изход на частен релей — истинският адрес на потребителя е скрит. Обявеното местоположение е приблизително и е избрано от доставчика на релея.";

const FEEDS: readonly Feed[] = [
  {
    id: "aws",
    url: "https://ip-ranges.amazonaws.com/ip-ranges.json",
    parse: (text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      const out: Entry[] = [];
      for (const item of records(data.prefixes)) {
        const cidr = str(item.ip_prefix);
        if (cidr) {
          out.push({
            cidr,
            value: {
              provider: "Amazon Web Services",
              kind: "cloud",
              region: str(item.region),
              service: str(item.service),
              meaning: CLOUD_MEANING,
            },
          });
        }
      }
      for (const item of records(data.ipv6_prefixes)) {
        const cidr = str(item.ipv6_prefix);
        if (cidr) {
          out.push({
            cidr,
            value: {
              provider: "Amazon Web Services",
              kind: "cloud",
              region: str(item.region),
              service: str(item.service),
              meaning: CLOUD_MEANING,
            },
          });
        }
      }
      return out;
    },
  },
  {
    id: "gcp",
    url: "https://www.gstatic.com/ipranges/cloud.json",
    parse: (text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      return records(data.prefixes).flatMap((item) => {
        const cidr = str(item.ipv4Prefix) ?? str(item.ipv6Prefix);
        return cidr
          ? [
              {
                cidr,
                value: {
                  provider: "Google Cloud",
                  kind: "cloud" as const,
                  region: str(item.scope),
                  service: str(item.service),
                  meaning: CLOUD_MEANING,
                },
              },
            ]
          : [];
      });
    },
  },
  {
    // `cloud.json` покрива само Google Cloud. Останалата инфраструктура на
    // Google (публичният DNS, услугите) е в `goog.json` — без него адреси като
    // 8.8.8.8 не се разпознават.
    id: "google-all",
    url: "https://www.gstatic.com/ipranges/goog.json",
    parse: (text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      return records(data.prefixes).flatMap((item) => {
        const cidr = str(item.ipv4Prefix) ?? str(item.ipv6Prefix);
        return cidr
          ? [
              {
                cidr,
                value: {
                  provider: "Google (обща инфраструктура)",
                  kind: "cloud" as const,
                  meaning: CLOUD_MEANING,
                },
              },
            ]
          : [];
      });
    },
  },
  {
    id: "cloudflare-v4",
    url: "https://www.cloudflare.com/ips-v4",
    parse: (text) => textList(text, { provider: "Cloudflare", kind: "cdn", meaning: CDN_MEANING }),
  },
  {
    id: "cloudflare-v6",
    url: "https://www.cloudflare.com/ips-v6",
    parse: (text) => textList(text, { provider: "Cloudflare", kind: "cdn", meaning: CDN_MEANING }),
  },
  {
    id: "fastly",
    url: "https://api.fastly.com/public-ip-list",
    parse: (text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      const all = [...(data.addresses as unknown[] ?? []), ...(data.ipv6_addresses as unknown[] ?? [])];
      return all.flatMap((item) => {
        const cidr = str(item);
        return cidr
          ? [{ cidr, value: { provider: "Fastly", kind: "cdn" as const, meaning: CDN_MEANING } }]
          : [];
      });
    },
  },
  {
    id: "googlebot",
    url: "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
    parse: (text) => {
      const data = JSON.parse(text) as Record<string, unknown>;
      return records(data.prefixes).flatMap((item) => {
        const cidr = str(item.ipv4Prefix) ?? str(item.ipv6Prefix);
        return cidr
          ? [
              {
                cidr,
                value: { provider: "Googlebot", kind: "crawler" as const, meaning: CRAWLER_MEANING },
              },
            ]
          : [];
      });
    },
  },
  {
    id: "apple-relay",
    url: "https://mask-api.icloud.com/egress-ip-ranges.csv",
    parse: (text) => {
      // `172.224.226.0/27,GB,GB-EN,London,`
      const out: Entry[] = [];
      for (const line of text.split("\n")) {
        const [cidr, , region, city] = line.trim().split(",");
        if (!cidr || !cidr.includes("/")) continue;
        out.push({
          cidr,
          value: {
            provider: "Apple iCloud Private Relay",
            kind: "relay",
            region: str(region),
            city: str(city),
            meaning: RELAY_MEANING,
          },
        });
      }
      return out;
    },
  },
];

function textList(text: string, value: Omit<ProviderInfo, "region" | "service" | "city">): Entry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("/"))
    .map((cidr) => ({ cidr, value }));
}

/**
 * Съставният набор от всички доставчици.
 *
 * Всеки списък се сваля и кешира ПООТДЕЛНО: падне ли един, останалите пак
 * работят. Половин отговор е несравнимо по-полезен от никакъв.
 */
async function providerSet(): Promise<CidrSet<ProviderInfo> | null> {
  const loaded = await Promise.all(
    FEEDS.map(async (feed) => {
      const result = await cached(`ranges:${feed.id}`, TTL_MS, async (signal) =>
        feed.parse(await fetchText(feed.url, signal)),
      );
      return result?.value ?? [];
    }),
  );

  const entries = loaded.flat();
  return entries.length > 0 ? new CidrSet(entries) : null;
}

const META = {
  source: "Публични диапазони на доставчиците",
  sourceUrl: "https://ip-ranges.amazonaws.com/ip-ranges.json",
};

export async function lookupProvider(ip: ParsedIp): Promise<SourceResult<ProviderInfo>> {
  const started = Date.now();
  const set = await providerSet();
  if (!set) {
    return {
      status: "error",
      message: "Списъците на доставчиците не са налични в момента.",
      ...META,
      ms: Date.now() - started,
    };
  }

  const match = set.match(ip.bytes);
  if (!match) {
    return {
      status: "empty",
      message:
        "Адресът не е в нито един от известните ни диапазони на облак, CDN или робот. Това НЕ доказва, че връзката е жилищна — покритието на списъците не е пълно.",
      ...META,
      ms: Date.now() - started,
    };
  }

  return { status: "ok", data: match.value, ...META, ms: Date.now() - started };
}

/** Само за интерфейса — да покаже колко блока стоят зад твърдението. */
export async function providerSetSize(): Promise<number> {
  return (await providerSet())?.size ?? 0;
}

