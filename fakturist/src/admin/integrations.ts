import type { Prisma } from '@prisma/client';
import { config, type AppConfig } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { MINUTE } from '../time.js';
import {
  DEFAULT_MAIL_FROM,
  INTEGRATIONS,
  isIntegrationCode,
  type IntegrationCode,
  type IntegrationDefinition,
} from './integration-defs.js';
import {
  openSecrets,
  RevolutConfig,
  sealSecrets,
  SecretsJson,
  secretHint,
  SmtpConfig,
  PeppolConfig,
  type PeppolEnvironment,
  type RevolutEnvironment,
} from './integration-form.js';

export * from './integration-defs.js';
export * from './integration-form.js';

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

/** Peppol (eConnect): само от панела — без client ID и тайна функцията е изключена. */
export interface PeppolSettings {
  environment: PeppolEnvironment;
  clientId: string;
  clientSecret: string;
}

export function resolvePeppol(panel: PanelIntegration | null): PeppolSettings | null {
  const parsed = panel ? PeppolConfig.safeParse(panel.config) : null;
  const secret = panel?.secrets['clientSecret'];
  if (!parsed?.success || !parsed.data.clientId || !secret) return null;
  return {
    environment: parsed.data.environment,
    clientId: parsed.data.clientId,
    clientSecret: secret,
  };
}

export async function peppolSettings(): Promise<PeppolSettings | null> {
  return resolvePeppol(await integrationState('peppol'));
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
    const schema = code === 'smtp' ? SmtpConfig : code === 'peppol' ? PeppolConfig : RevolutConfig;
    const saved = stored ? schema.safeParse(stored.config) : null;
    const source =
      code === 'smtp'
        ? (resolveSmtp(stored, cfg)?.source ?? 'none')
        : code === 'peppol'
          ? resolvePeppol(stored)
            ? 'panel'
            : 'none'
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
