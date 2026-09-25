import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createApp, readWidget } from './app.js';
import { VertexChatModel, type ChatModel } from './claude.js';
import { loadConfig, type Config } from './config.js';
import { log } from './logger.js';
import { loadProfiles } from './profiles.js';
import { PrismaStore } from './store/prisma.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Fail-closed: без проект или без четим файл с удостоверения AI е изключен (503),
 * а не „пробва нещо друго“. Никога не падаме към директния Anthropic API (не е в ЕС).
 */
function vertexOrNull(cfg: Config): ChatModel | null {
  if (!cfg.VERTEX_PROJECT_ID) {
    log('warn', 'vertex_disabled', { reason: 'Липсва VERTEX_PROJECT_ID' });
    return null;
  }
  const cred = cfg.GOOGLE_APPLICATION_CREDENTIALS;
  if (cred) {
    if (!existsSync(cred)) {
      log('warn', 'vertex_disabled', { reason: 'Файлът с удостоверения липсва' });
      return null;
    }
    if ((statSync(cred).mode & 0o077) !== 0) {
      log('error', 'vertex_disabled', { reason: 'Файлът с удостоверения трябва да е mode 600' });
      return null;
    }
  }
  return new VertexChatModel(cfg);
}

const cfg = loadConfig();
const db = new PrismaClient();
const app = createApp({
  cfg,
  store: new PrismaStore(db),
  model: vertexOrNull(cfg),
  profiles: loadProfiles(join(root, 'agents')),
  widgetJs: readWidget(join(root, 'public', 'widget.js')),
});

const server = app.listen(cfg.PORT, cfg.HOST, () => {
  log('info', 'listening', { host: cfg.HOST, port: cfg.PORT, region: cfg.VERTEX_REGION });
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => void db.$disconnect().finally(() => process.exit(0)));
  });
}
