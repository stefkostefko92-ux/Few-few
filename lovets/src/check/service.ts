import type { ContactTarget, Market, PhoneSource, Policy, Verdict } from '../compliance/types.js';
import { DEFAULT_POLICY, evaluateContact } from '../compliance/verdict.js';
import { fingerprint } from '../registry/fingerprint.js';
import { lookupKeys } from '../registry/keys.js';
import { resolveRegistryStatus } from '../registry/resolve.js';
import type { ComplianceStore } from '../store/types.js';
import { detectQuery } from './detect.js';

export interface CheckInput {
  query: string;
  market?: Market;
  sourceUrl?: string | null;
  phoneSource?: PhoneSource;
  businessLineConfirmed?: boolean;
}

export interface CheckDeps {
  store: ComplianceStore;
  pepper: string;
  now: () => Date;
  policy?: Policy;
}

/**
 * Търсачката за допустимост: за въведена стойност — присъда за всеки приложим пазар, със
 * състоянието в регистъра за отказ, „не ме търсете“ и съгласията от базата. Празен списък =
 * не е разпозната стойност.
 */
export async function checkContact(input: CheckInput, deps: CheckDeps): Promise<Verdict[]> {
  const detected = detectQuery(input.query, input.market);
  if (!detected) return [];
  // Каналът е само разпознатият: форма не може да се представи за LinkedIn, за да мине без КЗП.
  const channel = detected.channel;
  const policy = deps.policy ?? DEFAULT_POLICY;
  const out: Verdict[] = [];

  for (const market of detected.markets) {
    const target: ContactTarget = {
      market,
      channel,
      value: input.query,
      sourceUrl: input.sourceUrl ?? null,
      ...(input.phoneSource ? { phoneSource: input.phoneSource } : {}),
      ...(input.businessLineConfirmed ? { businessLineConfirmed: true } : {}),
    };
    const now = deps.now();
    const probe = evaluateContact(target, {
      now,
      suppressed: false,
      consents: [],
      registry: null,
      policy,
    });
    if (!probe.normalizedValue) {
      out.push(probe);
      continue;
    }
    const value = probe.normalizedValue;
    const fps = lookupKeys(value).map((k) => fingerprint(k, deps.pepper));
    const [suppressed, consents, registry] = await Promise.all([
      deps.store.isSuppressed(fps),
      deps.store.consentsFor(fingerprint(value, deps.pepper), channel),
      probe.registryNeeded
        ? resolveRegistryStatus(deps.store, probe.registryNeeded, value, deps.pepper)
        : Promise.resolve(null),
    ]);
    const verdict = evaluateContact(target, { now, suppressed, consents, registry, policy });
    if (!out.some((v) => v.market === verdict.market && v.channel === verdict.channel)) {
      out.push(verdict);
    }
  }
  return out;
}
