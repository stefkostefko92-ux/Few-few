import type { AppConfig } from '../config.js';

/**
 * Ключовете на панела, проверени по форма. Липсващ или невалиден ключ изключва САМО своята част
 * (fail closed): без APP_ENC_KEY панелът е затворен изцяло (TOTP е задължителен, а тайната му се
 * шифрова с него); без CS2DM_BRIDGE_KEY — командите към играта; без CS2DM_AGENT_KEY — сървърът.
 * Стойностите никога не стигат до лог — само имената на проблемните променливи.
 */
export interface AdminKeys {
  encKey: Buffer | null;
  bridgeKey: string | null;
  agentKey: string | null;
  /** Имената на зададените, но невалидни ключове — за предупреждение при старта. */
  invalid: string[];
}

/** Като в плъгина (§5) и агента (§9): по-къс ключ изключва канала. */
export const MIN_HMAC_KEY_LENGTH = 32;

export function adminKeys(
  cfg: Pick<AppConfig, 'APP_ENC_KEY' | 'CS2DM_BRIDGE_KEY' | 'CS2DM_AGENT_KEY'>,
): AdminKeys {
  const invalid: string[] = [];
  let encKey: Buffer | null = null;
  if (cfg.APP_ENC_KEY !== undefined) {
    if (/^[0-9a-fA-F]{64}$/.test(cfg.APP_ENC_KEY)) encKey = Buffer.from(cfg.APP_ENC_KEY, 'hex');
    else invalid.push('APP_ENC_KEY');
  }
  const hmacKey = (name: string, value: string | undefined): string | null => {
    if (value === undefined) return null;
    if (value.length >= MIN_HMAC_KEY_LENGTH) return value;
    invalid.push(name);
    return null;
  };
  return {
    encKey,
    bridgeKey: hmacKey('CS2DM_BRIDGE_KEY', cfg.CS2DM_BRIDGE_KEY),
    agentKey: hmacKey('CS2DM_AGENT_KEY', cfg.CS2DM_AGENT_KEY),
    invalid,
  };
}
