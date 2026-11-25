// Петте вида семки = петте slash команди. Името на командата е ключът на вида в базата.
export const SEED_KEYS = ['amnesia', 'ak', 'ogkush', 'purple', 'skunk'] as const;

export type SeedKey = (typeof SEED_KEYS)[number];

export const SEED_DEFAULT_LABELS: Readonly<Record<SeedKey, string>> = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};

export function isSeedKey(value: string): value is SeedKey {
  return (SEED_KEYS as readonly string[]).includes(value);
}
