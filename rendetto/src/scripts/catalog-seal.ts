import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { errorMessage, logger } from '../logger.js';
import { fromRoot } from '../paths.js';
import { openSealedCatalog, SEALED_CATALOG, sealCatalog } from '../services/catalog-seal.js';
import { catalogShape } from '../services/engine.js';

/**
 * Шифрова каталога от магазините за репото — на машината на собственика, не на сървъра:
 *   CATALOG_KEY=<64 hex> npm run catalog:seal          # data/catalog.json → sealed/catalog.json.enc
 * Ключът е същият като CATALOG_KEY в .env на сървъра. Нов ключ (`openssl rand -hex 32`) значи и нов
 * CATALOG_KEY на сървъра — иначе деплоят спира преди смяната на контейнерите (deploy.sh).
 */
function main(): void {
  const key = process.env.CATALOG_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('задай CATALOG_KEY — 64 hex знака (openssl rand -hex 32)');
  }
  const json = readFileSync(fromRoot(process.argv[2] ?? 'data/catalog.json'), 'utf8');
  if (!catalogShape.safeParse(JSON.parse(json) as unknown).success) {
    throw new Error('каталогът е с неочаквана форма');
  }
  const sealed = sealCatalog(json, key);
  if (openSealedCatalog(sealed, key) !== json)
    throw new Error('проверката след шифроването не мина');
  const target = fromRoot(SEALED_CATALOG);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(`${target}.tmp`, sealed);
  renameSync(`${target}.tmp`, target);
  logger.info({ file: SEALED_CATALOG, bytes: sealed.length }, 'каталогът е шифрован');
}

try {
  main();
} catch (error: unknown) {
  logger.error({ err: errorMessage(error) }, 'каталогът не е шифрован');
  process.exitCode = 1;
}
