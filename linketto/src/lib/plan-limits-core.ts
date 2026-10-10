import { planFor } from '@/lib/plans';
import { parseStyle } from '@/lib/style';

// Чиста логика (без база) на ограниченията при сваляне на план — вж.
// plan-limits.ts, който я прилага. Тества се отделно.

export interface LimitableProfile {
  id: string;
  customDomain: string | null;
  style: unknown;
  published: boolean;
}

export interface ProfilePatch {
  customDomain?: null;
  published?: boolean;
  style?: Record<string, unknown>;
}

/**
 * Какво трябва да спре за всеки профил при даден план. Профилите идват
 * подредени от най-стария; над `maxProfiles` се свалят от публикация.
 * Нищо не се трие.
 */
export function planLimitPatches(
  plan: string,
  profiles: readonly LimitableProfile[],
): { id: string; patch: ProfilePatch }[] {
  const def = planFor(plan);
  const out: { id: string; patch: ProfilePatch }[] = [];
  profiles.forEach((profile, index) => {
    const patch: ProfilePatch = {};
    if (!def.customDomain && profile.customDomain) patch.customDomain = null;
    if (!def.hideBadge) {
      const style = parseStyle(profile.style);
      if (style.hideBadge) patch.style = { ...style, hideBadge: false };
    }
    if (index >= def.maxProfiles && profile.published) {
      patch.published = false;
    }
    if (Object.keys(patch).length > 0) out.push({ id: profile.id, patch });
  });
  return out;
}
