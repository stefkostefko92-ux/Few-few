import { z } from 'zod';
import { withoutEmpty } from './config.js';

/**
 * Единният вход (OIDC / Microsoft Entra ID, §14.4, §15.1) — отделно от config.ts (там е таванът на
 * размера). Fail-closed като останалите ключове: зададен, но невалиден SSO_KEK спира процеса;
 * празен → единният вход е изключен (маршрутите връщат 503 `sso_unavailable`), паролата работи.
 */

/** 32 байта в base64 (`openssl rand -base64 32`) — като MFA_ENC_KEY и FILES_KEK. */
function isKey32(v: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32;
}

function keyList(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const SsoEnvSchema = z
  .object({
    /**
     * Ключът, с който се шифрова client secret на доставчиците в базата (AES-256-GCM, вързано към
     * клиента и записа). Загубата НЕ губи данни — администраторите въвеждат секретите наново.
     */
    SSO_KEK: z.string().trim().default(''),
    /** Стари ключове след ротация (запетаи) — само за четене; секретът се преписва при ползване. */
    SSO_KEK_PREVIOUS: z.string().trim().default(''),
    /** Таймаут на една заявка към доставчика (discovery, JWKS, token) — входът чака него. */
    SSO_HTTP_TIMEOUT_SECONDS: z.coerce.number().int().min(2).max(30).default(10),
    /** Само за сравнение: всеки ключ е за една цел. */
    MFA_ENC_KEY: z.string().trim().default(''),
    FILES_KEK: z.string().trim().default(''),
  })
  .superRefine((c, ctx) => {
    if (c.SSO_KEK === '') return;
    if (!isKey32(c.SSO_KEK)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SSO_KEK'],
        message: 'SSO_KEK трябва да е 32 байта в base64 (openssl rand -base64 32)',
      });
      return;
    }
    if (!keyList(c.SSO_KEK_PREVIOUS).every(isKey32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SSO_KEK_PREVIOUS'],
        message: 'SSO_KEK_PREVIOUS: ключове по 32 байта в base64, разделени със запетая',
      });
    }
    const raw = Buffer.from(c.SSO_KEK, 'base64');
    for (const other of ['MFA_ENC_KEY', 'FILES_KEK'] as const) {
      if (isKey32(c[other]) && Buffer.from(c[other], 'base64').equals(raw)) {
        ctx.addIssue({
          code: 'custom',
          path: ['SSO_KEK'],
          message: `SSO_KEK трябва да е различен от ${other} (отделен ключ за всяка цел)`,
        });
      }
    }
  });

export interface SsoEnv {
  /** null → единният вход е изключен. */
  keys: { current: Buffer; previous: Buffer[] } | null;
  timeoutSeconds: number;
}

export function loadSsoConfig(env: NodeJS.ProcessEnv = process.env): SsoEnv {
  const parsed = SsoEnvSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация на единния вход: ${issues}`);
  }
  const c = parsed.data;
  return {
    keys:
      c.SSO_KEK === ''
        ? null
        : {
            current: Buffer.from(c.SSO_KEK, 'base64'),
            previous: keyList(c.SSO_KEK_PREVIOUS).map((k) => Buffer.from(k, 'base64')),
          },
    timeoutSeconds: c.SSO_HTTP_TIMEOUT_SECONDS,
  };
}
