import { createApp } from './app.js';
import { config } from './config.js';
import { ensureSeed } from './seed.js';

// При първо стартиране зарежда началните данни (категории, страници, админ),
// ако базата е празна. Идемпотентно — не пренаписва съществуващи данни.
ensureSeed();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n  ✅ Сайтът на СГБ работи`);
  console.log(`     Адрес:    ${config.siteUrl}`);
  console.log(`     Локално:  http://localhost:${config.port}`);
  console.log(`     Среда:    ${config.env}`);
  console.log(`     Админ:    ${config.siteUrl}/admin\n`);
});

const shutdown = (sig) => {
  console.log(`\n  ${sig} получен — спиране…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
