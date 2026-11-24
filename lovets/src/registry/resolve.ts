import type { RegistryName, RegistryStatus } from '../compliance/types.js';
import { newest } from '../store/newest.js';
import type { ComplianceStore } from '../store/types.js';
import { fingerprint } from './fingerprint.js';
import { lookupKeys } from './keys.js';

/**
 * Последното известно състояние на нормализираната стойност в регистъра: от поединични резултати
 * и от пълна снимка — по-новото печели. Няма данни → null (двигателят блокира).
 */
export async function resolveRegistryStatus(
  store: ComplianceStore,
  registry: RegistryName,
  normalizedValue: string,
  pepper: string,
): Promise<RegistryStatus | null> {
  const fps = lookupKeys(normalizedValue).map((k) => fingerprint(k, pepper));
  const best = newest(
    await store.latestRegistryResult(registry, fps),
    await store.latestSnapshotResult(registry, fps),
  );
  return best ? { registry, ...best } : null;
}
