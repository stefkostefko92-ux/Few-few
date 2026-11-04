import { preparaArchivio } from './allegati/archivio.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { startMaintenance } from './maintenance.js';
import { assertModelliCartello } from './cartelli/modelli.js';
import { assertModuli } from './ordini/moduli.js';
import { assertPdfFonts } from './schede/pdf.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const cfg = config();
  assertPdfFonts(cfg.PDF_FONT_DIR);
  // Официалните модули на доставчиците — точно версията, по която са картите им (SHA-256).
  assertModuli();
  // Шаблоните на табелата „Avviso di fermo impianto“ — точно картинките на картите им (SHA-256).
  assertModelliCartello();
  // Снимките и клиповете: папките на тома и правото на запис (иначе процесът не тръгва).
  await preparaArchivio();
  await prisma.$connect();
  const server = createServer().listen(cfg.PORT, cfg.HOST, () => {
    logger.info({ port: cfg.PORT, host: cfg.HOST }, 'Rilievi слуша');
  });
  // Клип до 1 GB по бавна мобилна мрежа отнема повече от 5-те минути по подразбиране на Node за цялата
  // заявка. Заглавните редове остават с кратък срок (headersTimeout), отпред е nginx.
  server.requestTimeout = 60 * 60 * 1000;
  const timer = startMaintenance();
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'спиране');
    clearInterval(timer);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: errorMessage(error) }, 'процесът не тръгна');
  process.exit(1);
});
