// Справка IP → държава в локалната база DB-IP IP to Country Lite (CC BY 4.0,
// „IP Geolocation by DB-IP“ — https://db-ip.com). Само на сървъра (Node).
// Базата се сваля от `linketto-cron geoip` в DATA_DIR/geoip; без нея няма
// държава (fail-safe: езикът пада към Accept-Language). Нищо не излиза навън.

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Reader, type CountryResponse } from 'mmdb-lib';
import { countryFromRequest } from '@/lib/geo-country';

const RECHECK_MS = 10 * 60 * 1000;
let reader: Reader<CountryResponse> | null = null;
let loadedMtime = 0;
let checkedAt = 0;

export function geoipPath(): string {
  return (
    process.env.GEOIP_DB ||
    path.join(process.env.DATA_DIR ?? './data', 'geoip', 'dbip-country-lite.mmdb')
  );
}

// Зарежда базата лениво и я презарежда, когато файлът се смени (месечното
// обновяване) — проверката на файла е най-много веднъж на 10 минути.
function current(): Reader<CountryResponse> | null {
  const now = Date.now();
  if (checkedAt !== 0 && now - checkedAt < RECHECK_MS) return reader;
  checkedAt = now;
  try {
    const file = geoipPath();
    const { mtimeMs } = statSync(file);
    if (!reader || mtimeMs !== loadedMtime) {
      reader = new Reader<CountryResponse>(readFileSync(file));
      loadedMtime = mtimeMs;
    }
  } catch {
    // Липсваща или повредена база: пазим заредената досега (ако има).
  }
  return reader;
}

export function lookupCountry(ip: string): string | null {
  return current()?.get(ip)?.country?.iso_code ?? null;
}

/** Държавата на заявката (ISO-2) или null. */
export function requestCountry(headers: { get(name: string): string | null }): string | null {
  return countryFromRequest((name) => headers.get(name), lookupCountry);
}
