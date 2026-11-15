import { z } from 'zod';
import { decryptIntegrationSecrets, encryptIntegrationSecrets } from '../auth/keys.js';
import { INTEGRATIONS, type IntegrationCode } from './integration-defs.js';

/** Формите на интеграциите: схемите, разчитането на формата, шифроването на тайните. */
// --- Схемите ----------------------------------------------------------------------------------------

const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const ADDRESS = '[^\\s<>@"]+@[^\\s<>@"]+\\.[^\\s<>@"]+';
const MAILBOX = new RegExp(`^(?:[^<>@"\\r\\n]{1,100} <${ADDRESS}>|${ADDRESS})$`);

/**
 * SMTP сървърът е публично име с домейн: IP адрес, localhost, име без точка и вътрешни домейни се отказват
 * — иначе „Провери връзката“ би опипвал вътрешната мрежа (SSRF) и би показвал отговорите ѝ.
 */
function isPublicHostname(host: string): boolean {
  if (!host.includes('.')) return false;
  if (/^\d+(\.\d+){3}$/.test(host)) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host);
}

/** Подателят: „Име <адрес>“ или само адрес. Без нов ред — иначе е инжекция на заглавки. */
function isMailbox(value: string): boolean {
  return !/[\r\n]/.test(value) && MAILBOX.test(value);
}

export const SmtpConfig = z.object({
  host: z.string().min(1).max(253).regex(HOST),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().max(254),
  from: z.string().max(200).refine(isMailbox),
});

export const RevolutConfig = z.object({ environment: z.enum(['sandbox', 'production']) });

export const PeppolConfig = z.object({
  environment: z.enum(['acceptance', 'production']),
  clientId: z.string().max(200),
});
export type PeppolEnvironment = z.infer<typeof PeppolConfig>['environment'];

const PeppolForm = z.object({
  environment: z
    .string()
    .refine((value) => value === 'acceptance' || value === 'production', 'invalidEnvironment'),
  clientId: z
    .string()
    .trim()
    .max(200, 'invalidClientId')
    .regex(/^[\w.@:-]*$/, 'invalidClientId'),
});
export type RevolutEnvironment = z.infer<typeof RevolutConfig>['environment'];

/** Полетата на формите (текст от браузъра) → код на грешката на поле. */
const SmtpForm = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(HOST, 'invalidHost')
    .refine(isPublicHostname, 'invalidHost'),
  port: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, 'invalidPort')
    .transform(Number)
    .refine((port) => port >= 1 && port <= 65535, 'invalidPort'),
  secure: z.boolean(),
  user: z.string().trim().max(254, 'invalidUser').regex(/^\S*$/, 'invalidUser'),
  from: z.string().trim().max(200, 'invalidFrom').refine(isMailbox, 'invalidFrom'),
});

const RevolutForm = z.object({
  environment: z
    .string()
    .refine((value) => value === 'sandbox' || value === 'production', 'invalidEnvironment'),
});

/** Тайните: без интервали; webhook тайната на Revolut започва с wsk_ (документацията на Merchant API). */
const SECRET_RULES: Record<string, z.ZodType<string>> = {
  pass: z
    .string()
    .max(500, 'invalidSecret')
    .regex(/^\S{8,}$/, 'invalidSecret'),
  secretKey: z
    .string()
    .max(500, 'invalidSecret')
    .regex(/^\S{8,}$/, 'invalidSecret'),
  clientSecret: z
    .string()
    .max(500, 'invalidSecret')
    .regex(/^\S{8,}$/, 'invalidSecret'),
  webhookSecret: z
    .string()
    .max(500, 'invalidWebhookSecret')
    .regex(/^wsk_\S{8,}$/, 'invalidWebhookSecret'),
};

// --- Формата ----------------------------------------------------------------------------------------

export type ParsedIntegration =
  | {
      ok: true;
      config: Record<string, string | number | boolean>;
      secrets: Record<string, string>;
      changed: string[];
      cleared: string[];
    }
  | { ok: false; errors: Record<string, string> };

function text(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Формата на интеграция → нетайните настройки + тайните. Празно поле за тайна пази записаната стойност;
 * отметнато „изтрий“ я маха. `changed` и `cleared` са имената на полетата (за одита — без стойности).
 * `unreadable` — записани тайни, които не се дешифрират (сменен ключ, повреден запис): празно поле за тях
 * е грешка, а не тихо изтриване.
 */
export function parseIntegrationForm(
  code: IntegrationCode,
  body: Record<string, unknown>,
  current: Record<string, string>,
  unreadable: readonly string[] = [],
): ParsedIntegration {
  const errors: Record<string, string> = {};
  let parsedConfig: Record<string, string | number | boolean> = {};
  const result =
    code === 'smtp'
      ? SmtpForm.safeParse({
          host: text(body, 'host'),
          port: text(body, 'port'),
          secure: body['secure'] === 'on',
          user: text(body, 'user'),
          from: text(body, 'from'),
        })
      : code === 'peppol'
        ? PeppolForm.safeParse({
            environment: text(body, 'environment'),
            clientId: text(body, 'clientId'),
          })
        : RevolutForm.safeParse({ environment: text(body, 'environment') });
  if (result.success) parsedConfig = result.data;
  else
    for (const issue of result.error.issues) {
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }

  const secrets: Record<string, string> = {};
  const changed: string[] = [];
  const cleared: string[] = [];
  for (const field of INTEGRATIONS[code].fields) {
    if (!field.secret) continue;
    const raw = text(body, field.name).trim();
    if (body[`clear_${field.name}`] === 'on') {
      if (current[field.name] !== undefined || unreadable.includes(field.name)) {
        cleared.push(field.name);
      }
      continue;
    }
    if (raw === '') {
      const kept = current[field.name];
      if (kept !== undefined) secrets[field.name] = kept;
      else if (unreadable.includes(field.name)) errors[field.name] = 'reenterSecret';
      continue;
    }
    const rule = SECRET_RULES[field.name];
    const checked = rule ? rule.safeParse(raw) : { success: true as const, data: raw };
    if (!checked.success) {
      errors[field.name] = checked.error.issues[0]?.message ?? 'invalidSecret';
      continue;
    }
    secrets[field.name] = checked.data;
    if (checked.data !== current[field.name]) changed.push(field.name);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, config: parsedConfig, secrets, changed, cleared };
}

// --- Шифроване и показ ------------------------------------------------------------------------------

export const SecretsJson = z.record(z.string(), z.string());

export function sealSecrets(code: IntegrationCode, secrets: Record<string, string>): string | null {
  if (Object.keys(secrets).length === 0) return null;
  return encryptIntegrationSecrets(JSON.stringify(secrets), code);
}

/** Хвърля при подправен запис или запис на друга интеграция (AAD). */
export function openSecrets(code: IntegrationCode, payload: string): Record<string, string> {
  return SecretsJson.parse(JSON.parse(decryptIntegrationSecrets(payload, code)));
}

/** Какво вижда панелът от тайната: последните 4 знака, а при къса тайна — нищо. */
export function secretHint(value: string): string {
  return value.length >= 16 ? `…${value.slice(-4)}` : '••••';
}
