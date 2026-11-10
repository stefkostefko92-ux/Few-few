import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { preparaArchivio } from './allegati/archivio.js';
import { lavora, verificaStrumenti } from './allegati/coda.js';
import { mediaConfig } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';

/**
 * Фоновият процес на снимките и клиповете (отделен контейнер с ffmpeg, docker-compose.yml): компресира
 * каченото от опашката в базата (src/allegati/coda.ts). Едно нещо наведнъж и с ограничени нишки —
 * машината е обща. На всеки цикъл и на 15 секунди докосва файл „жив съм“ — по него Docker знае, че
 * процесът не е увиснал (healthcheck-ът в compose). SIGTERM: текущият файл се връща в опашката.
 */

export const BATTITO = join(tmpdir(), 'rilievi-worker.alive');

async function main(): Promise<void> {
  mediaConfig();
  sharp.concurrency(1);
  sharp.cache(false);
  await preparaArchivio();
  const controller = new AbortController();
  const stop = (signal: string): void => {
    logger.info({ signal }, 'allegati: спиране');
    controller.abort();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  const strumenti = await verificaStrumenti(controller.signal);
  await prisma.$connect();
  const battito = (): void => {
    writeFile(BATTITO, String(Date.now())).catch(() => undefined);
  };
  const timer = setInterval(battito, 15_000);
  logger.info({ zscale: strumenti.zscale }, 'allegati: обработката тръгна');
  try {
    await lavora(strumenti, controller.signal, battito);
  } finally {
    clearInterval(timer);
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.fatal({ err: errorMessage(error) }, 'обработката на снимките не тръгна');
    process.exit(1);
  });
