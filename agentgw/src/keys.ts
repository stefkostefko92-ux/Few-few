import { createHmac, randomBytes } from 'node:crypto';

export type KeyKind = 'PUBLIC' | 'SECRET';

/** 32 случайни байта в base64url = 43 знака; 256 бита ентропия — налучкване е невъзможно. */
const KEY_RE = /^cs_(pk|sk)_[A-Za-z0-9_-]{43}$/;

export interface KeyRecord {
  id: string;
  kind: KeyKind;
  hash: string;
  prefix: string;
  site: string;
  agents: string[];
  origins: string[];
  capMicroUsd: bigint;
  ratePerMin: number;
  active: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface NewKey {
  kind: KeyKind;
  site: string;
  agents: string[];
  origins: string[];
  capMicroUsd: bigint;
  ratePerMin: number;
}

export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: bigint;
}

export interface UsageTotals extends UsageDelta {
  month: string;
  requests: number;
}

export interface AuditEntry {
  actor: string;
  action: string;
  keyId?: string | null;
  detail?: Record<string, unknown>;
}

/** Хранилище — Prisma в продукция, в паметта за тестовете. */
export interface Store {
  createKey(input: NewKey & { hash: string; prefix: string }): Promise<KeyRecord>;
  findKeyByHash(hash: string): Promise<KeyRecord | null>;
  findKey(idOrPrefix: string): Promise<KeyRecord | null>;
  listKeys(): Promise<KeyRecord[]>;
  updateKey(
    id: string,
    patch: Partial<Pick<KeyRecord, 'agents' | 'origins' | 'capMicroUsd' | 'ratePerMin'>> & {
      revoke?: boolean;
    },
  ): Promise<KeyRecord>;
  /** Всички Origin-и на активни публични ключове — за CORS preflight. */
  activePublicOrigins(): Promise<Set<string>>;
  monthUsage(keyId: string, month: string): Promise<UsageTotals>;
  addUsage(keyId: string, month: string, delta: UsageDelta): Promise<void>;
  audit(entry: AuditEntry): Promise<void>;
}

export function generateKey(kind: KeyKind): string {
  const tag = kind === 'PUBLIC' ? 'pk' : 'sk';
  return `cs_${tag}_${randomBytes(32).toString('base64url')}`;
}

export function isKeyFormat(value: string): boolean {
  return KEY_RE.test(value);
}

export function kindOf(value: string): KeyKind | null {
  const m = KEY_RE.exec(value);
  if (!m) return null;
  return m[1] === 'pk' ? 'PUBLIC' : 'SECRET';
}

/** Детерминиран HMAC-SHA256 — позволява търсене по индекс, без ключът да се пази. */
export function hashKey(key: string, pepper: string): string {
  if (pepper.length < 32) throw new Error('KEY_PEPPER е твърде къс');
  return createHmac('sha256', pepper).update(key, 'utf8').digest('hex');
}

export function keyPrefix(key: string): string {
  return `${key.slice(0, 10)}…`;
}

export function usdToMicro(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) throw new Error('Таванът трябва да е неотрицателно число');
  return BigInt(Math.round(usd * 1_000_000));
}

export function microToUsd(micro: bigint): string {
  const cents = Number(micro) / 1_000_000;
  return cents.toFixed(4);
}

/** Месец по UTC: „ГГГГ-ММ“. */
export function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
