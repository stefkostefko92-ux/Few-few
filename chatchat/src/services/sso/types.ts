import type { CustomFetch } from 'openid-client';
import type { SecretBox } from './secret.js';

/**
 * Зависимостите на единния вход (OIDC / Microsoft Entra ID). Без тях (няма SSO_KEK) маршрутите
 * връщат 503 `sso_unavailable` — паролата работи, а REQUIRED режим остава в сила (fail-closed).
 */
export interface SsoDeps {
  /** Шифроването на client secret (SSO_KEK + предишните). */
  box: SecretBox;
  /** Таймаут на една заявка към доставчика (discovery, JWKS, token), в секунди. */
  timeoutSeconds: number;
  /** https://login.microsoftonline.com — тестовете го подменят с локалния фалшив доставчик. */
  entraAuthority: string;
  /** САМО за тестове: http издател (локален фалшив доставчик). В index.ts — винаги false. */
  allowInsecureHttp: boolean;
  /** САМО за unit тестове: fetch без мрежа. */
  fetch?: CustomFetch;
}

/** Началото на пътищата на единния вход — бисквитката на потока е вързана само към тях. */
export const SSO_BASE_PATH = '/api/v1/auth/sso';
export const SSO_CALLBACK_PATH = `${SSO_BASE_PATH}/callback`;

/** Обхватът на доставчик без фирма — вътрешните потребители на клиента. */
export const INTERNAL_SCOPE = 'internal';

/** Entra ID: издателят на директорията (v2.0) — от него и tid е проверката на токена. */
export function entraIssuer(authority: string, tenantGuid: string): string {
  return `${authority.replace(/\/+$/, '')}/${tenantGuid.toLowerCase()}/v2.0`;
}
