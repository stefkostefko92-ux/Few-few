import { PrismaClient } from '@prisma/client';
import { diagnose } from './ai/orchestrator.js';
import { VertexDiagnosisModel } from './ai/model.js';
import { createApp, type Diagnoser } from './app.js';
import { embeddingModelFrom } from './ai/embeddings.js';
import { aiEnabled, attachmentsEnabled, loadConfig, mfaKey } from './config.js';
import { createLogger } from './logger.js';
import type { AttachmentDeps } from './services/attachments.js';
import { EmbeddingIndexer } from './store/embeddings.js';
import { ClamdScanner } from './storage/antivirus.js';
import { FileAttachmentStore } from './storage/attachments.js';
import { RealtimeHub } from './realtime/hub.js';
import { PrismaKnowledgeStore } from './store/knowledge.js';
import { knowledgeSnapshotId } from './store/snapshot.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = new PrismaClient();

let diagnoser: Diagnoser | null = null;
let indexer: EmbeddingIndexer | null = null;
if (aiEnabled(config)) {
  // Семантичното търсене е по избор и fail-open; генерирането остава fail-closed.
  const embedder = embeddingModelFrom(config);
  const store = new PrismaKnowledgeStore(db, {
    embedder,
    queryTimeoutMs: config.EMBEDDING_TIMEOUT_MS,
    onError: (err) =>
      logger.warn(
        { err: (err as Error).name, status: (err as { status?: number }).status ?? null },
        'семантичното търсене е пропуснато — точно + пълнотекстово',
      ),
  });
  if (embedder) {
    indexer = new EmbeddingIndexer(db, embedder, logger, config.EMBEDDING_SWEEP_SECONDS);
    indexer.start();
  }
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
// Един процес = един хъб за SSE. Втори процес/машина иска pub/sub между хъбовете (CLAUDE.md).
const hub = new RealtimeHub({
  onError: (err) =>
    logger.warn({ errName: err instanceof Error ? err.name : 'unknown' }, 'поток в реално време'),
});

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
  mfaKey: mfaKey(config),
  diagnose: diagnoser,
  onDocumentPublished: indexer ? () => void indexer?.kick() : undefined,
  attachments,
  hub,
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
  indexer?.stop();
  // Отворените SSE потоци държат сървъра жив — затваряме ги, клиентите се връщат по REST.
  hub.closeAll();
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
