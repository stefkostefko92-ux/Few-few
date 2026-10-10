import type { PrismaClient } from '@prisma/client';
import { integrationKeys, type IntegrationsConfig } from '../../config-integrations.js';
import type { IntegrationDeps } from './deps.js';
import type { OutboxHooks } from './outbox-hooks.js';
import { SecretKeyring } from './secrets.js';
import { DEFAULT_MAX_RESPONSE_BYTES } from './ssrf.js';
import { IntegrationWorker } from './worker.js';

/**
 * Сглобяването в index.ts: само с INTEGRATION_KEK — иначе null (админ API 503, без изпращач).
 * Мрежовата политика в продукция е винаги строгата (https, само публични адреси). `hooks` —
 * метриките на изпращача (observability/helpdesk.ts), по избор; правят се само при включена
 * интеграция (иначе серии без изпращач биха изглеждали като здрав outbox).
 */
export function integrationsFrom(
  cfg: IntegrationsConfig,
  baseUrl: string,
  db: PrismaClient,
  logger: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void },
  hooks?: () => OutboxHooks,
): { deps: IntegrationDeps; worker: IntegrationWorker } | null {
  const keys = integrationKeys(cfg);
  if (!keys) return null;
  const deps: IntegrationDeps = {
    keyring: new SecretKeyring(keys.current, keys.previous),
    net: {
      allowInsecureLocal: false,
      timeoutMs: cfg.INTEGRATION_TIMEOUT_MS,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    },
    baseUrl,
    inboundToleranceSeconds: cfg.INTEGRATION_INBOUND_TOLERANCE_SECONDS,
    maxAttempts: cfg.INTEGRATION_MAX_ATTEMPTS,
    logDays: cfg.INTEGRATION_LOG_DAYS,
  };
  const worker = new IntegrationWorker(
    { db, integrations: deps, logger, ...(hooks ? { hooks: hooks() } : {}) },
    cfg.INTEGRATION_SWEEP_SECONDS,
  );
  return { deps, worker };
}
