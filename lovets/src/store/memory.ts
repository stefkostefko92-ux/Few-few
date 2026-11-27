import type { Channel, ConsentRecord, RegistryName } from '../compliance/types.js';
import { newest } from './newest.js';
import type {
  ComplianceStore,
  ConsentInput,
  RegistryResultInput,
  StoredRegistryResult,
  SuppressionScope,
} from './types.js';

interface Row extends StoredRegistryResult {
  registry: RegistryName;
  fingerprint: string;
}

interface Snapshot {
  registry: RegistryName;
  takenAt: Date;
  listed: Set<string>;
}

/** Хранилище в паметта — за тестовете. Същият договор като PrismaStore. */
export class MemoryStore implements ComplianceStore {
  private results: Row[] = [];
  private snapshots: Snapshot[] = [];
  private suppressed = new Set<string>();
  private reasons = new Map<string, string>();
  private consents = new Map<string, ConsentInput[]>();

  async saveRegistryResults(
    registry: RegistryName,
    entries: RegistryResultInput[],
    checkedAt: Date,
    _source: string,
  ): Promise<number> {
    for (const e of entries) this.results.push({ registry, checkedAt, ...e });
    return entries.length;
  }

  async registryResultsPerKey(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<Map<string, StoredRegistryResult>> {
    const out = new Map<string, StoredRegistryResult>();
    for (const r of this.results) {
      if (r.registry !== registry || !fingerprints.includes(r.fingerprint)) continue;
      const best = newest(out.get(r.fingerprint) ?? null, {
        listed: r.listed,
        checkedAt: r.checkedAt,
      });
      if (best) out.set(r.fingerprint, best);
    }
    return out;
  }

  async saveSnapshot(
    registry: RegistryName,
    takenAt: Date,
    fingerprints: string[],
    _source: string,
  ): Promise<void> {
    this.snapshots.push({ registry, takenAt, listed: new Set(fingerprints) });
  }

  private newestSnapshot(registry: RegistryName): Snapshot | undefined {
    return this.snapshots
      .filter((s) => s.registry === registry)
      .sort((x, y) => y.takenAt.getTime() - x.takenAt.getTime())[0];
  }

  async latestSnapshot(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<{ takenAt: Date; listed: Set<string> } | null> {
    const snap = this.newestSnapshot(registry);
    if (!snap) return null;
    return {
      takenAt: snap.takenAt,
      listed: new Set(fingerprints.filter((f) => snap.listed.has(f))),
    };
  }

  async latestSnapshotSize(registry: RegistryName): Promise<number> {
    return this.newestSnapshot(registry)?.listed.size ?? 0;
  }

  async isSuppressed(fingerprints: string[]): Promise<boolean> {
    return fingerprints.some((f) => this.suppressed.has(f));
  }

  async addSuppression(
    fingerprint: string,
    _scope: SuppressionScope,
    reason: string,
  ): Promise<void> {
    this.suppressed.add(fingerprint);
    // Като в базата: първият запис остава (upsert без update).
    if (!this.reasons.has(fingerprint)) this.reasons.set(fingerprint, reason);
  }

  /** Само за тестовете. */
  suppressionReason(fingerprint: string): string | undefined {
    return this.reasons.get(fingerprint);
  }

  async consentsFor(fingerprint: string, channel?: Channel): Promise<ConsentRecord[]> {
    return (this.consents.get(fingerprint) ?? [])
      .filter((c) => !channel || c.channel === channel)
      .map(({ channel: ch, givenAt, withdrawnAt }) => ({ channel: ch, givenAt, withdrawnAt }));
  }

  async addConsent(fingerprint: string, consent: ConsentInput): Promise<void> {
    this.consents.set(fingerprint, [...(this.consents.get(fingerprint) ?? []), consent]);
  }
}
