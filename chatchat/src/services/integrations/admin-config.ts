import type { HelpdeskIntegration, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../../audit.js';
import type { Principal } from '../../auth/sessions.js';
import { randomToken } from '../../crypto.js';
import { testWith } from './connectors/index.js';
import { inboundUrl, loadConnector, type IntegrationDeps } from './deps.js';
import { createHttpClient } from './http.js';
import { openSecrets, sealSecrets, type SecretValues } from './secrets.js';
import {
  HELPDESK_KINDS,
  parseSettings,
  requiredSecrets,
  secretFieldsOf,
  targetKey,
  targetUrlOf,
  validateSecret,
} from './settings.js';
import { checkUrl } from './ssrf.js';

/**
 * Настройката на конектора от администратора на клиента (`integrations:manage`): изглед без тайни
 * (само „зададена ли е“), запис (тайните — само за запис: пропуснато поле = без промяна, null =
 * изтрито), тест на връзката. Смяна на вида/целта трие старите тайни и връзки и пропуска
 * чакащите доставки (новият helpdesk започва от следващото събитие с тайните, въведени за него);
 * изключване — също пропуска чакащите.
 * Одит на всяка промяна: вид, включен, ИМЕНАТА на сменените полета и тайни — никога стойности.
 */

export type AdminResult<T> =
  { ok: true; value: T } | { ok: false; status: number; code: string; fields?: string[] };

const fail = (status: number, code: string, fields?: string[]): AdminResult<never> => ({
  ok: false,
  status,
  code,
  ...(fields ? { fields } : {}),
});

export const UpdateInput = z.object({
  kind: z.enum(HELPDESK_KINDS),
  enabled: z.boolean(),
  settings: z.record(z.string().max(40), z.unknown()),
  secrets: z.record(z.string().max(40), z.string().max(1024).nullable()).default({}),
});
export type UpdateIntegration = z.infer<typeof UpdateInput>;

export interface IntegrationView {
  kind: HelpdeskIntegration['kind'];
  enabled: boolean;
  settings: unknown;
  /** Кои тайни са зададени — никога стойностите им. */
  secrets: Record<string, boolean>;
  /** Тайните не се отварят (сменен INTEGRATION_KEK без INTEGRATION_KEK_PREVIOUS) — въведете ги наново. */
  secretsUnreadable: boolean;
  inboundUrl: string;
  updatedAt: Date;
}

function view(deps: IntegrationDeps, row: HelpdeskIntegration): IntegrationView {
  const loaded = loadConnector(deps, row);
  const values = 'error' in loaded ? {} : loaded.secrets;
  return {
    kind: row.kind,
    enabled: row.enabled,
    settings: row.settings,
    secrets: Object.fromEntries(secretFieldsOf(row.kind).map((f) => [f, Boolean(values[f])])),
    secretsUnreadable: 'error' in loaded && loaded.error.startsWith('secret_'),
    inboundUrl: inboundUrl(deps.baseUrl, row.inboundId),
    updatedAt: row.updatedAt,
  };
}

export async function getIntegrationView(
  db: PrismaClient,
  deps: IntegrationDeps,
  tenantId: string,
): Promise<IntegrationView | null> {
  const row = await db.helpdeskIntegration.findUnique({ where: { tenantId } });
  return row ? view(deps, row) : null;
}

function currentSecrets(deps: IntegrationDeps, row: HelpdeskIntegration | null): SecretValues {
  if (!row?.secrets) return {};
  try {
    return openSecrets(deps.keyring, row.tenantId, row.secrets);
  } catch {
    // Нечетими (сменен ключ) — записът започва на чисто, администраторът ги въвежда наново.
    return {};
  }
}

export async function updateIntegration(
  db: PrismaClient,
  deps: IntegrationDeps,
  p: Principal,
  input: UpdateIntegration,
): Promise<AdminResult<IntegrationView>> {
  const tenantId = p.user.tenantId;
  const parsed = parseSettings(input.kind, input.settings);
  if (!parsed) return fail(422, 'invalid_settings');
  const url = targetUrlOf(parsed);
  if (url !== null) {
    const checked = checkUrl(url, deps.net);
    if (!checked.ok) return fail(422, checked.code);
  }
  const existing = await db.helpdeskIntegration.findUnique({ where: { tenantId } });
  const kindChanged = existing !== null && existing.kind !== input.kind;
  const before = existing ? parseSettings(existing.kind, existing.settings) : null;
  const targetChanged = existing !== null && (!before || targetKey(before) !== targetKey(parsed));
  // Тайните са за ЦЕЛТА, не за клиента: нова цел (вид, адрес, поддомейн) започва без тайни —
  // иначе токенът на стария helpdesk би тръгнал към адрес, който само администраторът е сменил.
  const secretsReset = kindChanged || targetChanged;
  const secrets = secretsReset ? {} : currentSecrets(deps, existing);
  const allowed = secretFieldsOf(input.kind);
  const secretsChanged: string[] = [];
  for (const [field, value] of Object.entries(input.secrets)) {
    if (!allowed.includes(field)) return fail(422, 'invalid_secret_field', [field]);
    if (value === null || value.trim() === '') {
      if (field in secrets) secretsChanged.push(field);
      delete secrets[field];
      continue;
    }
    if (!validateSecret(input.kind, field, value)) return fail(422, 'invalid_secret', [field]);
    secrets[field] = value.trim();
    secretsChanged.push(field);
  }
  if (input.enabled) {
    const missing = requiredSecrets(input.kind, parsed.settings).filter((f) => !secrets[f]);
    if (missing.length > 0) return fail(422, 'secrets_missing', missing);
  }
  const previous = (existing?.settings ?? {}) as Record<string, unknown>;
  const settings = parsed.settings as Record<string, unknown>;
  const fieldsChanged = Object.keys(settings).filter(
    (k) => JSON.stringify(previous[k]) !== JSON.stringify(settings[k]),
  );
  const sealed =
    Object.keys(secrets).length > 0 ? sealSecrets(deps.keyring, tenantId, secrets) : null;
  const row = await db.$transaction(async (tx) => {
    const saved = await tx.helpdeskIntegration.upsert({
      where: { tenantId },
      create: {
        tenantId,
        kind: input.kind,
        enabled: input.enabled,
        settings: parsed.settings,
        secrets: sealed,
        inboundId: randomToken(16),
      },
      update: {
        kind: input.kind,
        enabled: input.enabled,
        settings: parsed.settings,
        secrets: sealed,
      },
    });
    let linksCleared = 0;
    let skipped = 0;
    if (targetChanged) {
      linksCleared = (await tx.helpdeskLink.deleteMany({ where: { integrationId: saved.id } }))
        .count;
    }
    if (targetChanged || !input.enabled) {
      skipped = (
        await tx.helpdeskDelivery.updateMany({
          where: { integrationId: saved.id, status: { in: ['PENDING', 'DEAD'] } },
          data: { status: 'SKIPPED', lastError: targetChanged ? 'reconfigured' : 'disabled' },
        })
      ).count;
    }
    await appendAudit(tx, {
      tenantId,
      actorId: p.user.id,
      action: existing ? 'integration.update' : 'integration.create',
      objectType: 'helpdesk_integration',
      objectId: saved.id,
      detail: {
        kind: input.kind,
        enabled: input.enabled,
        ...(existing ? { from: { kind: existing.kind, enabled: existing.enabled } } : {}),
        fieldsChanged,
        secretsChanged,
        // Смяна на вида или целта изтрива старите тайни (не се пренасят към друг helpdesk/адрес).
        secretsReset,
        targetChanged,
        linksCleared,
        skipped,
      },
    });
    return saved;
  });
  return { ok: true, value: view(deps, row) };
}

/** „Тест на връзката“ със записаната настройка; резултатът е код (без тайни) и влиза в одита. */
export async function testIntegration(
  db: PrismaClient,
  deps: IntegrationDeps,
  p: Principal,
): Promise<AdminResult<{ ok: boolean; code: string }>> {
  const row = await db.helpdeskIntegration.findUnique({ where: { tenantId: p.user.tenantId } });
  if (!row) return fail(404, 'not_configured');
  const loaded = loadConnector(deps, row);
  const result =
    'error' in loaded
      ? { ok: false as const, code: loaded.error }
      : await testWith(
          loaded.parsed,
          { http: createHttpClient(deps.net), secrets: loaded.secrets },
          deps.zendeskOrigin,
        );
  const out = { ok: result.ok, code: result.ok ? 'ok' : result.code };
  await appendAudit(db, {
    tenantId: row.tenantId,
    actorId: p.user.id,
    action: 'integration.test',
    objectType: 'helpdesk_integration',
    objectId: row.id,
    detail: { kind: row.kind, ok: out.ok, code: out.code },
  });
  return { ok: true, value: out };
}
