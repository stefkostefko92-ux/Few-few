import { accessSync, constants, statSync } from 'node:fs';
import { AnthropicVertex, type ClientOptions } from '@anthropic-ai/vertex-sdk';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import type { DraftModel, DraftUsage } from './generate.js';

/**
 * Хостът на мулти-региона `eu` (platform.claude.com → Claude Models on Google Cloud (Google
 * managed) → „Global, multi-region, and regional endpoints“). Подава се изрично: иначе SDK-то
 * чете `ANTHROPIC_VERTEX_BASE_URL` от средата и една променлива би изнесла заявките извън ЕС.
 */
export const VERTEX_EU_BASE_URL = 'https://aiplatform.eu.rep.googleapis.com/v1';

/** На опит. Под `proxy_read_timeout 120s` на nginx — не плащаме за отговор, който никой не чака. */
export const VERTEX_TIMEOUT_MS = 100_000;
/** 429/5xx/мрежа — SDK-то повтаря с нарастващо чакане; 4xx (403/404) не се повтарят. */
export const VERTEX_MAX_RETRIES = 2;
/** Общият таван на едно генериране, с повторните опити — също под 120 s на nginx. */
export const GENERATION_DEADLINE_MS = 115_000;

export type VertexSettings = Pick<
  AppConfig,
  'VERTEX_PROJECT_ID' | 'VERTEX_REGION' | 'VERTEX_MODEL' | 'GOOGLE_APPLICATION_CREDENTIALS'
>;

export interface ReadyAi {
  ready: true;
  projectId: string;
  region: 'eu';
  model: string;
  credentials: string;
}

export type AiSetup = ReadyAi | { ready: false; reason: string };

/**
 * Готов ли е AI — без мрежа, само по конфигурацията и файла. Неготов не е грешка: панелът,
 * публикуването и `/health` работят, а генерирането казва защо е изключено. Файл, по-отворен
 * от 600, изключва AI (както в agentgw) — ключ, който всеки на машината чете, не е тайна.
 */
export function aiSetup(cfg: VertexSettings): AiSetup {
  if (!cfg.VERTEX_PROJECT_ID) return { ready: false, reason: 'Липсва VERTEX_PROJECT_ID.' };
  const credentials = cfg.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentials) return { ready: false, reason: 'Липсва GOOGLE_APPLICATION_CREDENTIALS.' };
  let mode: number;
  try {
    mode = statSync(credentials).mode;
  } catch {
    return { ready: false, reason: 'Файлът с удостоверения липсва.' };
  }
  if ((mode & 0o077) !== 0) {
    return { ready: false, reason: 'Файлът с удостоверения трябва да е mode 600.' };
  }
  try {
    accessSync(credentials, constants.R_OK);
  } catch {
    return { ready: false, reason: 'Процесът не може да прочете файла с удостоверения.' };
  }
  return {
    ready: true,
    projectId: cfg.VERTEX_PROJECT_ID,
    region: cfg.VERTEX_REGION,
    model: cfg.VERTEX_MODEL,
    credentials,
  };
}

/**
 * Истинският клиент. Удостоверяването е Google (ADC чете GOOGLE_APPLICATION_CREDENTIALS);
 * SDK v1 не праща ANTHROPIC_API_KEY към Vertex. `overrides` е само за тестовете (без мрежа).
 */
export function createVertexClient(
  ai: ReadyAi,
  overrides: Pick<ClientOptions, 'authClient' | 'fetch'> = {},
): AnthropicVertex {
  return new AnthropicVertex({
    projectId: ai.projectId,
    region: ai.region,
    baseURL: VERTEX_EU_BASE_URL,
    timeout: VERTEX_TIMEOUT_MS,
    maxRetries: VERTEX_MAX_RETRIES,
    ...overrides,
  });
}

/** Разходът на всяко извикване в лога — само числа и модел, никога промпт или лични данни. */
export function logUsage(usage: DraftUsage, source: 'панел' | 'автопилот'): void {
  logger.info({ event: 'ai.usage', source, ...usage }, 'AI: разход на генериране');
}

/** Готовият модел за генериране — Vertex `eu` + запис на разхода. */
export function vertexDraftModel(ai: ReadyAi, source: 'панел' | 'автопилот'): DraftModel {
  return {
    client: createVertexClient(ai),
    model: ai.model,
    onUsage: (usage) => logUsage(usage, source),
  };
}
