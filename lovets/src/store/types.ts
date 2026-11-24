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
  /** Най-новият резултат за някой от отпечатъците; при еднаква дата „вписан“ печели. */
  latestRegistryResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null>;
  saveSnapshot(
    registry: RegistryName,
    takenAt: Date,
    fingerprints: string[],
    source: string,
  ): Promise<void>;
  /** Присъдата на най-новата пълна снимка на регистъра: вписан ли е някой от отпечатъците. */
  latestSnapshotResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null>;
  isSuppressed(fingerprints: string[]): Promise<boolean>;
  addSuppression(fingerprint: string, scope: SuppressionScope, reason: string): Promise<void>;
  consentsFor(fingerprint: string, channel?: Channel): Promise<ConsentRecord[]>;
  addConsent(fingerprint: string, consent: ConsentInput): Promise<void>;
}
