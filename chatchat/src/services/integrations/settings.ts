import type { HelpdeskKind } from '@prisma/client';
import { z } from 'zod';

/**
 * Настройката на конектора по вид: неповерителната част (`settings` в базата, вижда се в админ
 * UI) и тайните (шифровани, само за запис — API-то връща единствено „зададена ли е“).
 */

export const HELPDESK_KINDS = [
  'WEBHOOK',
  'ZENDESK',
  'JSM',
] as const satisfies readonly HelpdeskKind[];
/** Езикът на текстовете, които ChatChat пише в helpdesk-а (тема, описание, коментари). */
export const EXTERNAL_LANGS = ['it', 'en', 'bg'] as const;
export type ExternalLang = (typeof EXTERNAL_LANGS)[number];

const language = z.enum(EXTERNAL_LANGS).default('it');
const target = z.string().trim().min(1).max(500);
const numericId = z
  .string()
  .trim()
  .regex(/^\d{1,12}$/);

export const WebhookSettings = z.object({ url: target, language });
export const ZendeskSettings = z.object({
  /** Поддомейнът на https://<поддомейн>.zendesk.com — адресът се сглобява от сървъра. */
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  /** OAuth access token (препоръчан) или API token (Zendesk го води като остарял). */
  authMode: z.enum(['oauth', 'api_token']).default('oauth'),
  language,
});
export const JsmSettings = z.object({
  /** https://<сайт>.atlassian.net (или Data Center адресът) — минава SSRF проверката. */
  baseUrl: target,
  serviceDeskId: numericId,
  requestTypeId: numericId,
  language,
});

export type WebhookConfig = z.infer<typeof WebhookSettings>;
export type ZendeskConfig = z.infer<typeof ZendeskSettings>;
export type JsmConfig = z.infer<typeof JsmSettings>;

export const SETTINGS_SCHEMA = {
  WEBHOOK: WebhookSettings,
  ZENDESK: ZendeskSettings,
  JSM: JsmSettings,
} as const;

const secret = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Всяко поле на тайните по вид — със своята проверка (стойностите никога не се връщат). */
export const SECRET_FIELDS = {
  WEBHOOK: { signingSecret: secret(32, 256), inboundSecret: secret(32, 256) },
  ZENDESK: {
    accessToken: secret(20, 512),
    email: z.email().max(254),
    apiToken: secret(20, 256),
    inboundSecret: secret(16, 256),
  },
  JSM: { email: z.email().max(254), apiToken: secret(16, 512), inboundSecret: secret(16, 256) },
} as const;

export type SecretField<K extends HelpdeskKind> = keyof (typeof SECRET_FIELDS)[K] & string;

export function secretFieldsOf(kind: HelpdeskKind): string[] {
  return Object.keys(SECRET_FIELDS[kind]);
}

export function validateSecret(kind: HelpdeskKind, field: string, value: string): boolean {
  const schemas: Record<string, z.ZodType> = SECRET_FIELDS[kind];
  const schema = schemas[field];
  return schema !== undefined && schema.safeParse(value).success;
}

/** Задължителните тайни, за да е включен конекторът (входящата тайна е по избор). */
export function requiredSecrets(kind: HelpdeskKind, settings: unknown): string[] {
  if (kind === 'WEBHOOK') return ['signingSecret'];
  if (kind === 'JSM') return ['email', 'apiToken'];
  const parsed = ZendeskSettings.safeParse(settings);
  return parsed.success && parsed.data.authMode === 'api_token'
    ? ['email', 'apiToken']
    : ['accessToken'];
}

export type ParsedSettings =
  | { kind: 'WEBHOOK'; settings: WebhookConfig }
  | { kind: 'ZENDESK'; settings: ZendeskConfig }
  | { kind: 'JSM'; settings: JsmConfig };

export function parseSettings(kind: HelpdeskKind, raw: unknown): ParsedSettings | null {
  switch (kind) {
    case 'WEBHOOK': {
      const p = WebhookSettings.safeParse(raw);
      return p.success ? { kind, settings: p.data } : null;
    }
    case 'ZENDESK': {
      const p = ZendeskSettings.safeParse(raw);
      return p.success ? { kind, settings: p.data } : null;
    }
    case 'JSM': {
      const p = JsmSettings.safeParse(raw);
      return p.success ? { kind, settings: p.data } : null;
    }
  }
}

/** Адресът, който минава SSRF проверката при запис (Zendesk го сглобява от поддомейна). */
export function targetUrlOf(p: ParsedSettings): string | null {
  if (p.kind === 'WEBHOOK') return p.settings.url;
  if (p.kind === 'JSM') return p.settings.baseUrl;
  return null;
}

/** Целта (накъде отиват тикетите): смяна → старите връзки и чакащите доставки отпадат. */
export function targetKey(p: ParsedSettings): string {
  switch (p.kind) {
    case 'WEBHOOK':
      return `WEBHOOK|${p.settings.url}`;
    case 'ZENDESK':
      return `ZENDESK|${p.settings.subdomain}`;
    case 'JSM':
      return `JSM|${p.settings.baseUrl}|${p.settings.serviceDeskId}|${p.settings.requestTypeId}`;
  }
}
