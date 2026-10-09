import { PrismaClient } from '@prisma/client';
import { diagnose } from './ai/orchestrator.js';
import { VertexDiagnosisModel } from './ai/model.js';
import { createApp, type Diagnoser } from './app.js';
import { aiEnabled, attachmentsEnabled, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import type { AttachmentDeps } from './services/attachments.js';
import { ClamdScanner } from './storage/antivirus.js';
import { FileAttachmentStore } from './storage/attachments.js';
import { PrismaKnowledgeStore } from './store/knowledge.js';
import { knowledgeSnapshotId } from './store/snapshot.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = new PrismaClient();

let diagnoser: Diagnoser | null = null;
if (aiEnabled(config)) {
  const store = new PrismaKnowledgeStore(db);
  const model = new VertexDiagnosisModel(config);
  diagnoser = (input, signal) =>
    diagnose(
      {
        store,
        model,
        snapshotId: () => knowledgeSnapshotId(db, input.scope.tenantId),
        config,
      },
      input,
      signal,
    );
} else {
  logger.warn('VERTEX_PROJECT_ID липсва — AI е изключен, /chat/messages връща 503');
}

// Прикачени файлове: без хранилище — изключени; без антивирус — качването е изключено (503),
// а вече проверените файлове остават достъпни.
let attachments: AttachmentDeps | null = null;
if (attachmentsEnabled(config)) {
  attachments = {
    store: new FileAttachmentStore(config.ATTACHMENTS_DIR),
    scanner: config.CLAMAV_HOST
      ? new ClamdScanner({
          host: config.CLAMAV_HOST,
          port: config.CLAMAV_PORT,
          timeoutMs: config.CLAMAV_TIMEOUT_MS,
        })
      : null,
    urlKey: config.ATTACHMENT_URL_KEY,
  };
  if (!attachments.scanner) logger.warn('CLAMAV_HOST липсва — качването на файлове е изключено');
} else {
  logger.warn('ATTACHMENTS_DIR липсва — прикачените файлове са изключени');
}

const app = createApp({
  db,
  logger,
  publicOrigin: new URL(config.PUBLIC_BASE_URL).origin,
  trustProxy: config.TRUST_PROXY,
  privacyPolicyUrl: config.PRIVACY_POLICY_URL,
  sessions: {
    db,
    pepper: config.SESSION_PEPPER,
    ttlHours: config.SESSION_TTL_HOURS,
    secureCookies: config.NODE_ENV === 'production',
  },
  diagnose: diagnoser,
  attachments,
});

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      ai: diagnoser !== null,
      uploads: attachments?.scanner != null,
    },
    'chatchat слуша',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'спиране');
  server.close(() => {
    db.$disconnect()
      .catch((err: unknown) => logger.error({ err }, 'грешка при затваряне на базата'))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'незаловено отхвърляне');
});
