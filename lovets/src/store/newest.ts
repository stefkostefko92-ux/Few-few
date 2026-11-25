import type { StoredRegistryResult } from './types.js';

/** По-новата проверка печели; при еднаква дата — „вписан“ (по-строгото). */
export function newest(
  a: StoredRegistryResult | null,
  b: StoredRegistryResult | null,
): StoredRegistryResult | null {
  if (!a) return b;
  if (!b) return a;
  const d = a.checkedAt.getTime() - b.checkedAt.getTime();
  if (d !== 0) return d > 0 ? a : b;
  return a.listed ? a : b;
}
