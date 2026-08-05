import "server-only";

import { readFileSync } from "node:fs";
import { Reader, type CityResponse } from "mmdb-lib";

import { classifyNetwork, constrainGeoClaim, type GeoClaim } from "@/lib/geo-guards";
import type { ParsedIp } from "@/lib/ip";
import type { SourceResult } from "./base";

/**
 * Офлайн геолокация от DB-IP City Lite.
 *
 * Офлайн е решението, не подробност: базата се чете от диск и **не издава на
 * никого кой адрес е бил проверен**. За следствен режим това е единственият
 * приемлив вид геолокация — всяко външно гео API би уведомило трета страна за
 * обекта на разследването.
 *
 * Лиценз: CC BY 4.0. Атрибуцията е УСЛОВИЕ, не любезност — видимият линк към
 * DB-IP живее в `src/lib/site.ts` → `DATA_SOURCES` и се показва във футъра.
 * Не махай реда.
 *
 * Съзнателно НЕ ползваме MaxMind GeoLite2: EULA-та ѝ забранява употреба
 * „for the purpose of identifying or locating a specific household, individual,
 * or street address" — тоест забранява точно случая, за който този режим
 * съществува.
 *
 * Базата НЕ идва в хранилището: 124 MB е чужд файл с месечни издания. Сваля се
 * с `node scripts/fetch-geoip.mjs` и пътят ѝ се задава с `IPLOOKUP_GEOIP_DB`.
 * Липсва ли — справката работи без гео слой и го казва.
 */

const META = {
  source: "DB-IP City Lite (офлайн)",
  sourceUrl: "https://db-ip.com",
};

/**
 * DB-IP Lite ползва схемата на MaxMind DB, затова типът е техният `CityResponse`.
 * Полетата се четат отбранително — Lite изданието е по-бедно от пълното
 * (например `accuracy_radius` изобщо липсва, а `is_in_european_union` е счупено
 * и винаги `false`; не се ползва).
 */
type LoadState =
  | { kind: "ready"; reader: Reader<CityResponse>; path: string }
  | { kind: "missing"; reason: string };

/**
 * Базата се държи в паметта на процеса (~185 MB резидентни за City Lite).
 * Затова се зарежда ВЕДНЪЖ и лениво — при няколко работни процеса числото се
 * умножава, което е причина продукцията да работи с един процес.
 */
let state: LoadState | null = null;

function load(): LoadState {
  if (state) return state;

  const path = process.env.IPLOOKUP_GEOIP_DB?.trim();
  if (!path) {
    state = {
      kind: "missing",
      reason:
        "Офлайн гео базата не е настроена (IPLOOKUP_GEOIP_DB). Справката работи без гео слой — свали я с `node scripts/fetch-geoip.mjs`.",
    };
    return state;
  }

  try {
    state = { kind: "ready", reader: new Reader<CityResponse>(readFileSync(path)), path };
  } catch {
    // Пътят не се чете или файлът не е валиден MMDB. Не бива да сваля справката.
    state = { kind: "missing", reason: "Офлайн гео базата не можа да се прочете от зададения път." };
  }
  return state;
}

/** Само за тестове и след подмяна на базата. */
export function resetGeoIp(): void {
  state = null;
}

export interface GeoLookupInput {
  /** Име на мрежата от регистъра — оттам се разпознава мобилен пул. */
  networkName?: string;
  /** Име на автономната система. */
  asName?: string;
  /** Обратните имена — шаблоните на хостинг доставчиците личат в тях. */
  hostnames?: string[];
  /**
   * Съвпадение с публичен диапазон на облак или CDN. Това е ПОЛОЖИТЕЛНО
   * доказателство за инфраструктура — самият доставчик е обявил блока.
   */
  knownInfrastructure?: boolean;
}

export function lookupGeoIp(ip: ParsedIp, hints: GeoLookupInput = {}): SourceResult<GeoClaim> {
  const started = Date.now();
  const loaded = load();

  if (loaded.kind === "missing") {
    return { status: "empty", message: loaded.reason, ...META, ms: 0 };
  }

  let record: CityResponse | null = null;
  try {
    record = loaded.reader.get(ip.normalized);
  } catch {
    return {
      status: "error",
      message: "Гео базата отказа търсенето за този адрес.",
      ...META,
      ms: Date.now() - started,
    };
  }

  if (!record) {
    return {
      status: "empty",
      message: "Адресът не е в гео базата.",
      ...META,
      ms: Date.now() - started,
    };
  }

  // Класът се чете от САМООПИСАНИЕТО на оператора в регистъра. Непознатото
  // остава непознато и се третира предпазливо — виж `geo-guards.ts` защо.
  const networkClass = hints.knownInfrastructure
    ? "infrastructure"
    : classifyNetwork(hints.networkName, hints.asName, ...(hints.hostnames ?? []));

  const claim = constrainGeoClaim({
    country: record.country?.iso_code?.toUpperCase(),
    city: record.city?.names?.en,
    latitude: record.location?.latitude,
    longitude: record.location?.longitude,
    networkClass,
  });

  if (!claim.country && !claim.city) {
    return { status: "empty", message: "Записът не носи използваеми данни.", ...META, ms: Date.now() - started };
  }

  return { status: "ok", data: claim, ...META, ms: Date.now() - started };
}

/** За диагностика: заредена ли е базата и откъде. */
export function geoIpStatus(): { ready: boolean; path?: string; reason?: string } {
  const loaded = load();
  return loaded.kind === "ready"
    ? { ready: true, path: loaded.path }
    : { ready: false, reason: loaded.kind === "missing" ? loaded.reason : undefined };
}
