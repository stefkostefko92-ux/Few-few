import type { HelpdeskIntegration } from '@prisma/client';
import type { ZendeskOrigin } from './connectors/index.js';
import { openSecrets, SecretError, type SecretKeyring, type SecretValues } from './secrets.js';
import { parseSettings, type ParsedSettings } from './settings.js';
import type { NetPolicy } from './ssrf.js';

/**
 * Зависимостите на интеграцията с helpdesk — сглобяват се в index.ts само с INTEGRATION_KEK
 * (иначе null: админ API 503, изпращачът не тръгва). Тестовете подават своя мрежова политика
 * (локален фалшив сървър) и адрес на „Zendesk“ — от код, никога от средата.
 */
export interface IntegrationDeps {
  keyring: SecretKeyring;
  net: NetPolicy;
  /** https://chatchat.carbonstealth.eu — връзките обратно към случая и входящият адрес. */
  baseUrl: string;
  /** Прозорецът за времевия печат на входящите известия (± секунди). */
  inboundToleranceSeconds: number;
  maxAttempts: number;
  /** Колко дни се пазят доставените/пропуснатите редове. */
  logDays: number;
  /** Само за тестовете: адресът на Zendesk по поддомейна. */
  zendeskOrigin?: ZendeskOrigin;
}

export interface LoadedConnector {
  parsed: ParsedSettings;
  secrets: SecretValues;
}

/** Настройката + отворените тайни; код при повредена настройка или ключ, който го няма. */
export function loadConnector(
  deps: Pick<IntegrationDeps, 'keyring'>,
  integration: Pick<HelpdeskIntegration, 'kind' | 'settings' | 'secrets' | 'tenantId'>,
): LoadedConnector | { error: string } {
  const parsed = parseSettings(integration.kind, integration.settings);
  if (!parsed) return { error: 'settings_invalid' };
  if (!integration.secrets) return { parsed, secrets: {} };
  try {
    return {
      parsed,
      secrets: openSecrets(deps.keyring, integration.tenantId, integration.secrets),
    };
  } catch (err) {
    return { error: err instanceof SecretError ? `secret_${err.reason}` : 'secret_corrupt' };
  }
}

/** Входящият адрес, който администраторът поставя в helpdesk-а. */
export function inboundUrl(baseUrl: string, inboundId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1/integrations/inbound/${inboundId}`;
}
