import type { SsoConfig } from '@prisma/client';
import * as oidc from 'openid-client';
import type { SsoDeps } from './types.js';

/**
 * Клиентът към доставчика — openid-client v6 (panva; сертифициран OpenID RP, без други
 * зависимости освен jose и oauth4webapi на същия автор). Защо не собствен клиент върху jose:
 * discovery с проверка на `issuer`, PKCE, state, nonce, `iss` в отговора (RFC 9207), сравненията на
 * claims с толеранс и кешът на JWKS са точно частите, в които самоделен код греши.
 *
 * Подписът на id_token: по OIDC Core 3.1.3.7 при код от token endpoint по TLS той не е задължителен
 * и openid-client не го проверява по подразбиране — тук го ВКЛЮЧВАМЕ (`enableNonRepudiationChecks`):
 * JWKS от `jwks_uri`, кеш до 5 мин., нов при непознат `kid` (не по-често от 60 s); `alg` = none и
 * HS* (симетрични с client secret) не минават. Толерансът за exp/nbf/iat е 60 s.
 *
 * Конфигурацията (metadata + JWKS кешът) се пази в паметта по доставчик за 1 час; смяна на
 * издателя/клиента/секрета я подменя веднага. Пренасочвания не се следват; само HTTPS (освен в
 * тестовете с локален фалшив доставчик).
 */

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
export const CLOCK_TOLERANCE_SECONDS = 60;

type ProviderRow = Pick<SsoConfig, 'id' | 'issuer' | 'clientId' | 'secretUpdatedAt'>;

interface Entry {
  stamp: string;
  at: number;
  config: oidc.Configuration;
}

/** client_secret_basic, освен ако доставчикът обявява само client_secret_post (RFC 8414: basic по подразбиране). */
function clientAuth(meta: oidc.ServerMetadata, secret: string): oidc.ClientAuth {
  const methods = meta.token_endpoint_auth_methods_supported;
  if (Array.isArray(methods) && !methods.includes('client_secret_basic')) {
    return oidc.ClientSecretPost(secret);
  }
  return oidc.ClientSecretBasic(secret);
}

export class ProviderCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly deps: SsoDeps) {}

  private stampOf(row: ProviderRow): string {
    return `${row.issuer}|${row.clientId}|${row.secretUpdatedAt.getTime()}`;
  }

  /** Discovery на издателя (без клиентски данни) — и за проверката на конфигурацията. */
  async discover(issuer: string): Promise<oidc.ServerMetadata> {
    const execute = this.deps.allowInsecureHttp ? [oidc.allowInsecureRequests] : [];
    const probe = await oidc.discovery(new URL(issuer), 'chatchat-probe', undefined, oidc.None(), {
      execute,
      timeout: this.deps.timeoutSeconds,
      ...(this.deps.fetch ? { [oidc.customFetch]: this.deps.fetch } : {}),
    });
    return probe.serverMetadata();
  }

  async get(row: ProviderRow, secret: string): Promise<oidc.Configuration> {
    const stamp = this.stampOf(row);
    const hit = this.entries.get(row.id);
    if (hit && hit.stamp === stamp && Date.now() - hit.at < TTL_MS) return hit.config;
    const meta = await this.discover(row.issuer);
    const config = new oidc.Configuration(
      meta,
      row.clientId,
      { [oidc.clockTolerance]: CLOCK_TOLERANCE_SECONDS },
      clientAuth(meta, secret),
    );
    config.timeout = this.deps.timeoutSeconds;
    if (this.deps.fetch) config[oidc.customFetch] = this.deps.fetch;
    if (this.deps.allowInsecureHttp) oidc.allowInsecureRequests(config);
    oidc.enableNonRepudiationChecks(config);
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(row.id, { stamp, at: Date.now(), config });
    return config;
  }

  forget(id: string): void {
    this.entries.delete(id);
  }
}

/** Единният вход на процеса: зависимостите + кешът на доставчиците (един за всички маршрути). */
export interface SsoRuntime {
  sso: SsoDeps;
  cache: ProviderCache;
}

export function ssoRuntime(sso: SsoDeps | null | undefined): SsoRuntime | null {
  return sso ? { sso, cache: new ProviderCache(sso) } : null;
}

/**
 * Безопасен за лога код на грешка от openid-client/oauth4webapi: името и `code` — НИКОГА
 * съобщението или `cause` (там може да има claims, тяло на отговор или токен).
 */
export function oidcErrorCode(err: unknown): { errName: string; errCode: string | null } {
  if (typeof err !== 'object' || err === null) return { errName: 'unknown', errCode: null };
  const name = 'name' in err && typeof err.name === 'string' ? err.name : 'Error';
  const code = 'code' in err && typeof err.code === 'string' ? err.code : null;
  return { errName: name.slice(0, 60), errCode: code ? code.slice(0, 80) : null };
}
