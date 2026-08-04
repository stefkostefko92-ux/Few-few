import "server-only";

import {
  embeddedIpv4,
  interfaceIdentifier,
  isGloballyRoutable,
  reverseName,
  specialRange,
  type EmbeddedIpv4,
  type InterfaceIdentifier,
  type ParsedIp,
  type SpecialRange,
} from "./ip";
import type { SourceResult } from "./sources/base";
import { lookupOriginAsn, lookupReverseDns, type OriginAsn, type ReverseDns } from "./sources/dns";
import { lookupGeofeed, type GeofeedEntry } from "./sources/geofeed";
import { lookupProvider, type ProviderInfo } from "./sources/ranges";
import { lookupReputation, type Reputation } from "./sources/reputation";
import { geofeedUrlFrom, lookupRdap, type RdapNetwork } from "./sources/rdap";
import { capabilities } from "./mode";

/**
 * Сглобява пълната справка за един адрес.
 *
 * Два принципа:
 *
 * 1. **Всичко, което може, върви успоредно.** Единствената истинска зависимост
 *    е geofeed-ът — адресът на файла се обявява в регистъра, значи трябва да
 *    дочакаме RDAP. Останалите пет източника нямат общо помежду си.
 * 2. **Не питаме за безсмислени адреси.** За `192.168.1.1` външен източник или
 *    мълчи, или си измисля. По-честно е да не питаме и да го кажем.
 */

export interface LookupReport {
  ip: ParsedIp;
  /** Локален анализ — винаги наличен, никога не зависи от мрежата. */
  local: {
    special: SpecialRange | null;
    embedded: EmbeddedIpv4 | null;
    interfaceId: InterfaceIdentifier | null;
    reverse: string;
    globallyRoutable: boolean;
  };
  rdap: SourceResult<RdapNetwork> | null;
  origin: SourceResult<OriginAsn> | null;
  ptr: SourceResult<ReverseDns> | null;
  provider: SourceResult<ProviderInfo> | null;
  reputation: SourceResult<Reputation> | null;
  geofeed: SourceResult<GeofeedEntry> | null;
  /** Общото време на справката — показва се, за да е видима цената. */
  totalMs: number;
}

export async function lookup(ip: ParsedIp): Promise<LookupReport> {
  const started = Date.now();

  const local: LookupReport["local"] = {
    special: specialRange(ip),
    embedded: embeddedIpv4(ip),
    interfaceId: interfaceIdentifier(ip),
    reverse: reverseName(ip),
    globallyRoutable: isGloballyRoutable(ip),
  };

  if (!local.globallyRoutable) {
    return {
      ip,
      local,
      rdap: null,
      origin: null,
      ptr: null,
      provider: null,
      reputation: null,
      geofeed: null,
      totalMs: Date.now() - started,
    };
  }

  const [rdap, origin, ptr, provider, reputation] = await Promise.all([
    lookupRdap(ip),
    lookupOriginAsn(ip),
    lookupReverseDns(ip),
    lookupProvider(ip),
    lookupReputation(ip),
  ]);

  // Geofeed заявката отива ПРАВО на сървъра на оператора на търсения адрес —
  // тоест издава, че някой проверява точно този префикс. В следствен режим това
  // е оперативен теч и се прави само при изрично разрешение на органа.
  const allowed = capabilities();
  const geofeed = allowed.geofeed
    ? await lookupGeofeed(ip, rdap.data ? geofeedUrlFrom(rdap.data) : null)
    : {
        status: "empty" as const,
        message:
          "Geofeed не беше изтеглен: заявката щеше да отиде директно на сървъра на оператора на този адрес и да издаде проверката. Включва се с IPLOOKUP_ALLOW_GEOFEED=1.",
        source: "Geofeed на оператора (RFC 8805)",
        sourceUrl: "https://www.rfc-editor.org/rfc/rfc8805.html",
        ms: 0,
      };

  return { ip, local, rdap, origin, ptr, provider, reputation, geofeed, totalMs: Date.now() - started };
}

/**
 * Най-доброто налично твърдение за държава — и откъде идва то.
 *
 * Подредбата не е произволна: geofeed-ът е обявен от самия оператор, регистърът
 * казва само къде е РЕГИСТРИРАНА организацията (често седалището, не мрежата),
 * а маршрутният произход е още по-груб. Затова всяко твърдение носи източника
 * си — потребителят вижда не само „BG“, а и колко струва това „BG“.
 */
export function bestCountry(
  report: LookupReport,
): { code: string; basis: string; confidence: "high" | "medium" | "low" } | null {
  const geofeed = report.geofeed?.data;
  if (geofeed?.country) {
    return {
      code: geofeed.country,
      basis: "обявено от оператора на мрежата в geofeed файл",
      confidence: "high",
    };
  }
  const relay = report.provider?.data;
  if (relay?.kind === "relay" && relay.region) {
    return { code: relay.region.slice(0, 2), basis: `обявено от ${relay.provider}`, confidence: "medium" };
  }
  const rdapCountry = report.rdap?.data?.country;
  if (rdapCountry) {
    return {
      code: rdapCountry,
      basis: "държава по регистрация на мрежата (не е геолокация)",
      confidence: "medium",
    };
  }
  const originCountry = report.origin?.data?.country;
  if (originCountry) {
    return {
      code: originCountry,
      basis: "държава на регистъра, разпределил блока",
      confidence: "low",
    };
  }
  return null;
}
