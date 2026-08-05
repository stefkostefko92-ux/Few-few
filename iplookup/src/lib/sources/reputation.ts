import "server-only";

import { CidrSet, parseCidrLines } from "@/lib/cidr-set";
import type { ParsedIp } from "@/lib/ip";
import { cached, fetchText } from "./cache";
import type { SourceResult } from "./base";

/**
 * Репутация — само публични списъци, разрешени за търговска употреба.
 *
 * Нарочно НЕ ползваме: Spamhaus DNSBL (публичните огледала са само за
 * нетърговска употреба и блокират заявки през общи резолвери), AbuseIPDB
 * (иска ключ), GreyNoise (50 заявки на СЕДМИЦА). Оставаме с два източника,
 * които са безплатни, честни и позволени, и казваме открито какво покриват.
 *
 * Отсъствието от списък НЕ е сертификат за добро поведение — само толкова,
 * че конкретните списъци не го познават. Интерфейсът го формулира точно така.
 */

export interface ReputationHit {
  list: string;
  /** Какво точно твърди списъкът. */
  claim: string;
  /** Идентификатор на записа, ако списъкът дава такъв (например SBL номер). */
  reference?: string;
  severity: "info" | "warn" | "danger";
}

export interface Reputation {
  hits: ReputationHit[];
  /** Кои списъци успяхме да проверим — важно е кое е проверено, а не само кое е намерено. */
  checked: string[];
  /** Списъци, които не се заредиха — тогава „чисто“ е непълно твърдение. */
  unavailable: string[];
}

const META = {
  source: "Публични репутационни списъци",
  sourceUrl: "https://www.spamhaus.org/blocklists/do-not-route-or-peer/",
};

// ── Tor ───────────────────────────────────────────────────────────────────

const TOR_TTL_MS = 60 * 60 * 1000;

async function torExits(): Promise<CidrSet<true> | null> {
  const result = await cached("tor-exits", TOR_TTL_MS, async (signal) => {
    const text = await fetchText("https://check.torproject.org/torbulkexitlist", signal);
    return parseCidrLines(text).map((cidr) => ({ cidr, value: true as const }));
  });
  return result ? new CidrSet(result.value) : null;
}

// ── Spamhaus DROP ─────────────────────────────────────────────────────────

/**
 * DROP („Don't Route Or Peer“) е списъкът на блокове, които Spamhaus смята за
 * изцяло контролирани от престъпни оператори. За разлика от DNSBL-ите, DROP е
 * свободен и за търговска употреба, срещу изричен кредит на източника.
 * Spamhaus моли за сваляне не по-често от веднъж на час — затова TTL-ът е 6 ч.
 */
const DROP_TTL_MS = 6 * 60 * 60 * 1000;

async function spamhausDrop(): Promise<CidrSet<string | undefined> | null> {
  const result = await cached("spamhaus-drop", DROP_TTL_MS, async (signal) => {
    const text = await fetchText("https://www.spamhaus.org/drop/drop_v4.json", signal);
    const entries: { cidr: string; value: string | undefined }[] = [];
    // Форматът е JSONL — по един запис на ред, плюс редове с метаданни.
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const record = JSON.parse(trimmed) as Record<string, unknown>;
        const cidr = typeof record.cidr === "string" ? record.cidr : null;
        if (cidr) {
          entries.push({ cidr, value: typeof record.sblid === "string" ? record.sblid : undefined });
        }
      } catch {
        // Ред с метаданни или счупен ред — пропускаме само него.
      }
    }
    return entries;
  });
  return result ? new CidrSet(result.value) : null;
}

// ── Справката ─────────────────────────────────────────────────────────────

export async function lookupReputation(ip: ParsedIp): Promise<SourceResult<Reputation>> {
  const started = Date.now();
  const [tor, drop] = await Promise.all([torExits(), spamhausDrop()]);

  const hits: ReputationHit[] = [];
  const checked: string[] = [];
  const unavailable: string[] = [];

  if (tor) {
    checked.push("Списък на изходните възли на Tor");
    if (tor.match(ip.bytes)) {
      hits.push({
        list: "Tor",
        claim:
          "Адресът е ИЗХОДЕН ВЪЗЕЛ на Tor. Трафикът, който излиза оттук, принадлежи на непознат потребител на мрежата, а не на притежателя на адреса.",
        severity: "info",
      });
    }
  } else {
    unavailable.push("Списък на изходните възли на Tor");
  }

  if (drop) {
    checked.push("Spamhaus DROP");
    const match = drop.match(ip.bytes);
    if (match) {
      hits.push({
        list: "Spamhaus DROP",
        claim:
          "Блокът е в списъка DROP на Spamhaus — тоест е обявен за изцяло контролиран от престъпен оператор и мнозина го спират на ниво маршрутизация.",
        reference: match.value,
        severity: "danger",
      });
    }
  } else {
    unavailable.push("Spamhaus DROP");
  }

  if (checked.length === 0) {
    return {
      status: "error",
      message: "Нито един репутационен списък не е достъпен в момента.",
      ...META,
      ms: Date.now() - started,
    };
  }

  return {
    status: "ok",
    data: { hits, checked, unavailable },
    ...META,
    ms: Date.now() - started,
  };
}
