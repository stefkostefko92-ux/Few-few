import "server-only";

import { Resolver } from "node:dns/promises";

import { parseIp, reverseName, type ParsedIp } from "@/lib/ip";
import { runSource, type SourceResult } from "./base";

/**
 * DNS справките — обратното име и произходът на маршрута.
 *
 * Ползваме собствен `Resolver` с изричен таймаут, а не глобалния: иначе една
 * мълчаща authoritative зона държи заявката десетки секунди. `node:dns` не
 * приема `AbortSignal`, затова таймаутът се задава на самия резолвър.
 */

function resolver(timeoutMs = 3000): Resolver {
  return new Resolver({ timeout: timeoutMs, tries: 2 });
}

// ── Обратен DNS ───────────────────────────────────────────────────────────

export interface ReverseDns {
  names: string[];
  /**
   * Потвърдено ли е името в двете посоки (FCrDNS)?
   *
   * PTR записът се контролира от собственика на АДРЕСА и може да сочи където
   * си иска — `example.com` в PTR не значи нищо само по себе си. Едва когато
   * името се резолвва ОБРАТНО до същия адрес, двойката е доказана. Точно това
   * проверяват пощенските сървъри, преди да приемат поща.
   */
  forwardConfirmed: boolean;
  /** Кои от имената издържаха проверката. */
  confirmed: string[];
}

const REVERSE_META = { source: "Обратен DNS (PTR)", sourceUrl: "https://www.rfc-editor.org/rfc/rfc1035" };

export async function lookupReverseDns(ip: ParsedIp): Promise<SourceResult<ReverseDns>> {
  return runSource(REVERSE_META, async () => {
    const dns = resolver();
    let names: string[];
    try {
      names = await dns.reverse(ip.normalized);
    } catch {
      // Липсващ PTR е нормално състояние за огромна част от адресите, не грешка.
      return null;
    }
    if (names.length === 0) return null;

    const confirmed: string[] = [];
    await Promise.all(
      names.slice(0, 5).map(async (name) => {
        try {
          const addresses = ip.version === 4 ? await dns.resolve4(name) : await dns.resolve6(name);
          const matches = addresses.some((address) => parseIp(address)?.normalized === ip.normalized);
          if (matches) confirmed.push(name);
        } catch {
          // Името не се резолвва напред — просто остава непотвърдено.
        }
      }),
    );

    return { names, confirmed, forwardConfirmed: confirmed.length > 0 };
  });
}

// ── Произход на маршрута (Team Cymru) ─────────────────────────────────────

export interface OriginAsn {
  asn: number;
  /** Обявеният в BGP префикс — истинската „мрежа“, за разлика от регистъра. */
  prefix?: string;
  country?: string;
  registry?: string;
  allocated?: string;
  /** Името на автономната система (например `CLOUDFLARENET, US`). */
  asName?: string;
}

const CYMRU_META = {
  source: "Team Cymru (IP → ASN)",
  sourceUrl: "https://team-cymru.com/community-services/ip-asn-mapping/",
};

/** Име за Cymru: същите обърнати етикети като при PTR, но с тяхната зона. */
function cymruName(ip: ParsedIp): string {
  if (ip.version === 4) {
    return `${reverseName(ip).replace(/\.in-addr\.arpa$/, "")}.origin.asn.cymru.com`;
  }
  return `${reverseName(ip).replace(/\.ip6\.arpa$/, "")}.origin6.asn.cymru.com`;
}

/** Отговорът е един ред с полета, разделени с `|`. */
function splitRow(chunks: string[][]): string[] | null {
  const row = chunks[0]?.join("");
  if (!row) return null;
  return row.split("|").map((field) => field.trim());
}

export async function lookupOriginAsn(ip: ParsedIp): Promise<SourceResult<OriginAsn>> {
  return runSource(CYMRU_META, async () => {
    const dns = resolver();

    let fields: string[] | null;
    try {
      fields = splitRow(await dns.resolveTxt(cymruName(ip)));
    } catch {
      return null;
    }
    if (!fields) return null;

    // `13335 | 1.1.1.0/24 | US | arin | 2010-07-14`
    // Един префикс може да се обявява от няколко AS-а (multi-origin) — вземаме
    // първия и го отбелязваме като „произход“, не като „собственик“.
    const asn = Number(fields[0]?.split(/\s+/)[0]);
    if (!Number.isInteger(asn) || asn <= 0) return null;

    const origin: OriginAsn = {
      asn,
      prefix: fields[1] || undefined,
      country: fields[2]?.toUpperCase() || undefined,
      registry: fields[3] || undefined,
      allocated: fields[4] || undefined,
    };

    try {
      const nameFields = splitRow(await dns.resolveTxt(`AS${asn}.asn.cymru.com`));
      // `13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US`
      origin.asName = nameFields?.[4] || undefined;
    } catch {
      // Името на AS-а е приятно, но не е задължително.
    }

    return origin;
  });
}
