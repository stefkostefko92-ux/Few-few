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

  async latestRegistryResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null> {
    let best: StoredRegistryResult | null = null;
    for (const r of this.results) {
      if (r.registry === registry && fingerprints.includes(r.fingerprint)) {
        best = newest(best, { listed: r.listed, checkedAt: r.checkedAt });
      }
    }
    return best;
  }

  async saveSnapshot(
    registry: RegistryName,
    takenAt: Date,
    fingerprints: string[],
    _source: string,
  ): Promise<void> {
    this.snapshots.push({ registry, takenAt, listed: new Set(fingerprints) });
  }

  async latestSnapshotResult(
    registry: RegistryName,
    fingerprints: string[],
  ): Promise<StoredRegistryResult | null> {
    const latest = this.snapshots
      .filter((s) => s.registry === registry)
      .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())[0];
    if (!latest) return null;
    return { listed: fingerprints.some((f) => latest.listed.has(f)), checkedAt: latest.takenAt };
  }

  async isSuppressed(fingerprints: string[]): Promise<boolean> {
    return fingerprints.some((f) => this.suppressed.has(f));
  }

  async addSuppression(
    fingerprint: string,
    _scope: SuppressionScope,
    _reason: string,
  ): Promise<void> {
    this.suppressed.add(fingerprint);
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
