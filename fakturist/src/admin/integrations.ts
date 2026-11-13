import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config, type AppConfig } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { MINUTE } from '../time.js';
import { decryptIntegrationSecrets, encryptIntegrationSecrets } from '../auth/keys.js';

/**
 * Външните услуги, които мастър акаунтът настройва от панела (Настройки): пощата (Brevo SMTP) и Revolut
 * Merchant API. ЕДИНСТВЕНИЯТ списък — панелът рисува формите от тук. Тайните се пазят шифровани в
 * Integration.secretsEnc и никога не се връщат към изгледа — само последните 4 знака. Панелът има
 * предимство пред `.env`; без панел важи `.env` (резерва при първото пускане).
 */
export type IntegrationCode = 'smtp' | 'revolut';

interface Text {
  bg: string;
  en: string;
}

export interface IntegrationField {
  name: string;
  kind: 'text' | 'number' | 'checkbox' | 'select' | 'secret';
  secret: boolean;
  label: Text;
  help?: Text;
  placeholder?: string;
  options?: readonly string[];
}

export interface IntegrationDefinition {
  label: Text;
  help: Text;
  fields: readonly IntegrationField[];
  defaults: Record<string, string | number | boolean>;
}

export const DEFAULT_MAIL_FROM = 'Фактурист <no-reply@fakturist.eu>';

export const INTEGRATIONS = {
  smtp: {
    label: { bg: 'Поща (Brevo SMTP)', en: 'Email (Brevo SMTP)' },
    help: {
      bg: 'Писмата към шкафчетата и поканите за прехвърляне. Данните са в Brevo → SMTP & API → SMTP. Порт 2525 минава и там, където 25, 465 и 587 са блокирани.',
      en: 'Inbox notifications and transfer invitations. Find the values in Brevo → SMTP & API → SMTP. Port 2525 works where 25, 465 and 587 are blocked.',
    },
    fields: [
      {
        name: 'host',
        kind: 'text',
        secret: false,
        label: { bg: 'SMTP сървър', en: 'SMTP server' },
        placeholder: 'smtp-relay.brevo.com',
      },
      {
        name: 'port',
        kind: 'number',
        secret: false,
        label: { bg: 'Порт', en: 'Port' },
        placeholder: '2525',
      },
      {
        name: 'secure',
        kind: 'checkbox',
        secret: false,
        label: { bg: 'TLS от началото на връзката', en: 'TLS from the start' },
        help: {
          bg: 'Само за порт 465. На 2525 и 587 връзката минава на TLS със STARTTLS — без него не се свързва.',
          en: 'Port 465 only. On 2525 and 587 the connection upgrades to TLS with STARTTLS — or does not connect.',
        },
      },
      {
        name: 'user',
        kind: 'text',
        secret: false,
        label: { bg: 'Вход (SMTP login)', en: 'Login (SMTP login)' },
      },
      {
        name: 'pass',
        kind: 'secret',
        secret: true,
        label: { bg: 'SMTP ключ', en: 'SMTP key' },
      },
      {
        name: 'from',
        kind: 'text',
        secret: false,
        label: { bg: 'Подател', en: 'Sender' },
        help: {
          bg: 'Адресът трябва да е потвърден подател (или домейн) в Brevo.',
          en: 'The address must be a verified sender (or domain) in Brevo.',
        },
        placeholder: DEFAULT_MAIL_FROM,
      },
    ],
    defaults: { host: '', port: 2525, secure: false, user: '', from: DEFAULT_MAIL_FROM },
  },
  revolut: {
    label: { bg: 'Revolut Merchant API', en: 'Revolut Merchant API' },
    help: {
      bg: 'Ключовете са в Revolut Business → Merchant API. Sandbox и продукцията имат различни ключове. Тайната на webhook-а проверява известията за платени поръчки.',
      en: 'Find the keys in Revolut Business → Merchant API. Sandbox and production have separate keys. The webhook secret verifies paid-order notifications.',
    },
    fields: [
      {
        name: 'environment',
        kind: 'select',
        secret: false,
        label: { bg: 'Среда', en: 'Environment' },
        options: ['sandbox', 'production'],
      },
      {
        name: 'secretKey',
        kind: 'secret',
        secret: true,
        label: { bg: 'Secret API key', en: 'Secret API key' },
        help: {
          bg: 'Ползва се за проверката на връзката и за плащанията с карта (етап 2).',
          en: 'Used for the connection check and for card payments (stage 2).',
        },
      },
      {
        name: 'webhookSecret',
        kind: 'secret',
        secret: true,
        label: { bg: 'Тайна на webhook-а (wsk_…)', en: 'Webhook signing secret (wsk_…)' },
      },
    ],
    defaults: { environment: 'sandbox' },
  },
} as const satisfies Record<IntegrationCode, IntegrationDefinition>;

export function isIntegrationCode(value: string): value is IntegrationCode {
  return value === 'smtp' || value === 'revolut';
}

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

const SmtpConfig = z.object({
  host: z.string().min(1).max(253).regex(HOST),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().max(254),
  from: z.string().max(200).refine(isMailbox),
});
export type SmtpConfigValue = z.infer<typeof SmtpConfig>;

const RevolutConfig = z.object({ environment: z.enum(['sandbox', 'production']) });
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

const SecretsJson = z.record(z.string(), z.string());

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

// --- Кое важи: панелът или .env ---------------------------------------------------------------------

export interface PanelIntegration {
  config: unknown;
  secrets: Record<string, string>;
}

export interface SmtpSettings {
  source: 'panel' | 'env';
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

type SmtpEnv = Partial<
  Pick<
    AppConfig,
    'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'MAIL_FROM'
  >
>;

export function resolveSmtp(panel: PanelIntegration | null, env: SmtpEnv): SmtpSettings | null {
  const fromPanel = panel ? SmtpConfig.safeParse(panel.config) : null;
  if (fromPanel?.success && panel) {
    return {
      source: 'panel',
      host: fromPanel.data.host,
      port: fromPanel.data.port,
      secure: fromPanel.data.secure,
      user: fromPanel.data.user || null,
      pass: panel.secrets['pass'] ?? null,
      from: fromPanel.data.from,
    };
  }
  if (!env.SMTP_HOST) return null;
  return {
    source: 'env',
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 2525,
    secure: env.SMTP_SECURE ?? false,
    user: env.SMTP_USER ?? null,
    pass: env.SMTP_PASS ?? null,
    from: env.MAIL_FROM ?? DEFAULT_MAIL_FROM,
  };
}

export interface RevolutSettings {
  source: 'panel' | 'env' | 'none';
  environment: RevolutEnvironment;
  secretKey: string | null;
  webhookSecret: string | null;
}

export function resolveRevolut(
  panel: PanelIntegration | null,
  env: Partial<Pick<AppConfig, 'REVOLUT_WEBHOOK_SECRET'>>,
): RevolutSettings {
  const fromPanel = panel ? RevolutConfig.safeParse(panel.config) : null;
  const envSecret = env.REVOLUT_WEBHOOK_SECRET ?? null;
  if (fromPanel?.success && panel) {
    return {
      source: 'panel',
      environment: fromPanel.data.environment,
      secretKey: panel.secrets['secretKey'] ?? null,
      webhookSecret: panel.secrets['webhookSecret'] ?? envSecret,
    };
  }
  return {
    source: envSecret ? 'env' : 'none',
    environment: 'sandbox',
    secretKey: null,
    webhookSecret: envSecret,
  };
}

// --- Базата -----------------------------------------------------------------------------------------

export interface StoredIntegration extends PanelIntegration {
  hints: Record<string, string>;
  /** Записаните тайни не се дешифрират — формата иска да се въведат наново. */
  unreadable: boolean;
  lastCheckAt: Date | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  updatedAt: Date;
}

let cache: { at: number; rows: Map<IntegrationCode, StoredIntegration> } | null = null;

export function invalidateIntegrations(): void {
  cache = null;
}

async function loadAll(): Promise<Map<IntegrationCode, StoredIntegration>> {
  if (cache && Date.now() - cache.at < MINUTE) return cache.rows;
  const rows = new Map<IntegrationCode, StoredIntegration>();
  for (const row of await prisma.integration.findMany()) {
    if (!isIntegrationCode(row.code)) continue;
    let secrets: Record<string, string> = {};
    let unreadable = false;
    if (row.secretsEnc) {
      try {
        secrets = openSecrets(row.code, row.secretsEnc);
      } catch (error) {
        unreadable = true;
        // Повреден запис или сменен LEDGER_SEAL_KEY: без тайни (отказ), не с чужди.
        logger.error(
          { code: row.code, err: errorMessage(error) },
          'тайните на интеграция не се четат',
        );
      }
    }
    rows.set(row.code, {
      config: row.config,
      secrets,
      unreadable,
      hints: SecretsJson.catch({}).parse(row.secretHints ?? {}),
      lastCheckAt: row.lastCheckAt,
      lastCheckOk: row.lastCheckOk,
      lastCheckError: row.lastCheckError,
      updatedAt: row.updatedAt,
    });
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function integrationState(code: IntegrationCode): Promise<StoredIntegration | null> {
  return (await loadAll()).get(code) ?? null;
}

export async function smtpSettings(): Promise<SmtpSettings | null> {
  return resolveSmtp(await integrationState('smtp'), config());
}

export async function revolutSettings(): Promise<RevolutSettings> {
  return resolveRevolut(await integrationState('revolut'), config());
}

export async function saveIntegration(input: {
  code: IntegrationCode;
  config: Record<string, string | number | boolean>;
  secrets: Record<string, string>;
  changed: string[];
  cleared: string[];
  actorId: string;
}): Promise<void> {
  const hints = Object.fromEntries(
    Object.entries(input.secrets).map(([name, value]) => [name, secretHint(value)]),
  );
  const data = {
    config: input.config as Prisma.InputJsonObject,
    secretsEnc: sealSecrets(input.code, input.secrets),
    secretHints: hints,
    updatedById: input.actorId,
  };
  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: { code: input.code },
      create: { code: input.code, ...data },
      update: data,
    });
    await audit(tx, {
      actorId: input.actorId,
      action: 'admin.integration.saved',
      targetType: 'Integration',
      targetId: input.code,
      details: { code: input.code, changed: input.changed, cleared: input.cleared },
    });
  });
  invalidateIntegrations();
}

/** Резултатът от „Провери връзката“ — грешката вече е без адреси и тайни (integration-checks.ts). */
export async function recordCheck(
  code: IntegrationCode,
  result: { ok: boolean; error: string | null },
  actorId: string,
): Promise<void> {
  const check = { lastCheckAt: new Date(), lastCheckOk: result.ok, lastCheckError: result.error };
  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: { code },
      create: { code, config: {}, ...check, updatedById: actorId },
      update: check,
    });
    await audit(tx, {
      actorId,
      action: 'admin.integration.checked',
      targetType: 'Integration',
      targetId: code,
      details: { code, ok: result.ok },
    });
  });
  invalidateIntegrations();
}

export interface IntegrationView {
  code: IntegrationCode;
  definition: IntegrationDefinition;
  values: Record<string, unknown>;
  hints: Record<string, string>;
  unreadable: boolean;
  source: 'panel' | 'env' | 'none';
  lastCheckAt: Date | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
}

/** Каквото рисува панелът: записаните нетайни стойности (иначе подразбиращите се) и само подсказките. */
export async function integrationsView(): Promise<IntegrationView[]> {
  const cfg = config();
  const views: IntegrationView[] = [];
  for (const code of Object.keys(INTEGRATIONS) as IntegrationCode[]) {
    const stored = await integrationState(code);
    const definition: IntegrationDefinition = INTEGRATIONS[code];
    const schema = code === 'smtp' ? SmtpConfig : RevolutConfig;
    const saved = stored ? schema.safeParse(stored.config) : null;
    const source =
      code === 'smtp'
        ? (resolveSmtp(stored, cfg)?.source ?? 'none')
        : resolveRevolut(stored, cfg).source;
    views.push({
      code,
      definition,
      values: saved?.success ? saved.data : { ...definition.defaults },
      hints: stored?.hints ?? {},
      unreadable: stored?.unreadable ?? false,
      source,
      lastCheckAt: stored?.lastCheckAt ?? null,
      lastCheckOk: stored?.lastCheckOk ?? null,
      lastCheckError: stored?.lastCheckError ?? null,
    });
  }
  return views;
}
