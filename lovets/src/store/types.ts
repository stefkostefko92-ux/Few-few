import type { Channel, ConsentRecord, RegistryName } from '../compliance/types.js';

export interface RegistryResultInput {
  fingerprint: string;
  listed: boolean;
}

export interface StoredRegistryResult {
  listed: boolean;
  checkedAt: Date;
}

export interface ConsentInput extends ConsentRecord {
  /** Как е дадено: устно по телефона, писмено, през форма… */
  method: string;
  /** Точният текст, на който е казано „да“. */
  wording: string;
}

export type SuppressionScope = 'value' | 'domain' | 'company';

/**
 * Хранилището на проверките. Две реализации: MemoryStore (тестове) и PrismaStore (продукция).
 * Всички ключове са отпечатъци (fingerprint) — без открити стойности.
 */
export interface ComplianceStore {
  saveRegistryResults(
    registry: RegistryName,
    entries: RegistryResultInput[],
    checkedAt: Date,
    source: string,
  ): Promise<number>;
  /** Най-новият резултат за всеки отпечатък поотделно; при еднаква дата „вписан“ печели. */
  registryResultsPerKey(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<Map<string, StoredRegistryResult>>;
  saveSnapshot(
    registry: RegistryName,
    takenAt: Date,
    fingerprints: string[],
    source: string,
  ): Promise<void>;
  /** Най-новата пълна снимка: датата ѝ и кои от отпечатъците са вписани в нея. */
  latestSnapshot(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<{ takenAt: Date; listed: Set<string> } | null>;
  /** Колко стойности има в най-новата снимка (0 — няма снимка). */
  latestSnapshotSize(registry: RegistryName): Promise<number>;
  isSuppressed(fingerprints: string[]): Promise<boolean>;
  addSuppression(fingerprint: string, scope: SuppressionScope, reason: string): Promise<void>;
  consentsFor(fingerprint: string, channel?: Channel): Promise<ConsentRecord[]>;
  addConsent(fingerprint: string, consent: ConsentInput): Promise<void>;
}
