import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import maxmind, { type CountryResponse } from 'maxmind';
import { config } from '../config.js';
import { errorMessage, logger } from '../logger.js';
import { fromRoot } from '../paths.js';

/**
 * Сваля DB-IP „IP to Country Lite“ (CC BY 4.0, атрибуцията е в панела и в политиката) за текущия
 * месец, а ако още не е публикуван — за предишния. Проверява файла, преди да подмени стария.
 */
function month(offset: number): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function download(target: string): Promise<string> {
  for (const offset of [0, 1]) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month(offset)}.mmdb.gz`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok || !res.body) {
      logger.warn({ status: res.status, month: month(offset) }, 'няма файл за този месец');
      continue;
    }
    const tmp = `${target}.download`;
    // Правата — изрично, не от umask-а: `docker compose exec` (DEPLOY.md, т. 4) може да върви с umask
    // 0000 и файлът би станал 666. Остатък от прекъснато сваляне се прави наново, не с правата си.
    rmSync(tmp, { force: true });
    await pipeline(
      Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>),
      createGunzip(),
      createWriteStream(tmp, { mode: 0o600 }),
    );
    return tmp;
  }
  throw new Error('DB-IP не върна файл за текущия или предишния месец');
}

async function main(): Promise<void> {
  const target = fromRoot(config().GEOIP_PATH);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const tmp = await download(target);
  const reader = await maxmind.open<CountryResponse>(tmp);
  const probe = reader.get('8.8.8.8')?.country?.iso_code;
  if (!probe) {
    rmSync(tmp, { force: true });
    throw new Error('файлът не дава държава за проверовъчен адрес');
  }
  renameSync(tmp, target);
  logger.info({ probe }, 'базата за държава по IP е обновена');
}

main().catch((error: unknown) => {
  logger.error({ err: errorMessage(error) }, 'обновяването на базата за държава по IP се провали');
  process.exitCode = 1;
});
