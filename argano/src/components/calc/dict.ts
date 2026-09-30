import type { CalcDict } from '@/lib/present/tr';

// The calculator texts come from next-intl's messages (namespace "calc"); a missing namespace would show keys.
export function asCalcDict(x: unknown): CalcDict {
  if (x === null || typeof x !== 'object') throw new Error('calc messages missing');
  return x as CalcDict;
}
