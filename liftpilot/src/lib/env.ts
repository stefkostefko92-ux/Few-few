import 'server-only';
import { parseEnv, type Env } from './env-schema';

// Server configuration, validated once on first use (the build runs without it): src/lib/env-schema.ts.
export type { Env };
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

/** Public URL without trailing slash; safe to call at build time. */
export const publicBaseUrl = (): string => (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const indexingAllowed = (): boolean => process.env.ALLOW_INDEXING === 'true';
