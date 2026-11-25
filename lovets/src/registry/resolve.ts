import type { RegistryName, RegistryStatus } from '../compliance/types.js';
import { newest } from '../store/newest.js';
import type { ComplianceStore, StoredRegistryResult } from '../store/types.js';
import { fingerprint } from './fingerprint.js';
import { lookupKeys } from './keys.js';

/**
 * Състоянието на стойността в регистъра. „Най-новото печели“ важи само в рамките на един ключ;
 * между ключовете — „вписан“ печели (вписан домейн обхваща адреса, вписан адрес не се отменя от
 * чист домейн). „Не е вписан“ иска проверка на самата стойност (или пълна снимка) — чист домейн не
 * доказва чист адрес. Няма данни → null (двигателят блокира).
 */
export async function resolveRegistryStatus(
  store: ComplianceStore,
  registry: RegistryName,
  normalizedValue: string,
  pepper: string,
): Promise<RegistryStatus | null> {
  const fps = lookupKeys(normalizedValue).map((k) => fingerprint(k, pepper));
  const [perKey, snapshot] = await Promise.all([
    store.registryResultsPerKey(registry, fps),
    store.latestSnapshot(registry, fps),
  ]);
  const stateOf = (fp: string): StoredRegistryResult | null =>
    newest(
      perKey.get(fp) ?? null,
      snapshot ? { listed: snapshot.listed.has(fp), checkedAt: snapshot.takenAt } : null,
    );

  const states = fps.map(stateOf);
  const listed = states.filter((s): s is StoredRegistryResult => s?.listed === true);
  if (listed.length) {
    const latest = listed.reduce((a, b) => (a.checkedAt >= b.checkedAt ? a : b));
    return { registry, listed: true, checkedAt: latest.checkedAt };
  }
  const exact = states[0];
  return exact ? { registry, listed: false, checkedAt: exact.checkedAt } : null;
}
