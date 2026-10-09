import { createHash } from 'node:crypto';
import type { AuditEntry } from '../keys.js';

/** Канонична JSON форма (сортирани ключове) — jsonb в PostgreSQL не пази реда им. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** hash = SHA-256(prevHash | at | actor | action | keyId | detail). */
export function auditHash(prevHash: string, at: Date, e: AuditEntry): string {
  return createHash('sha256')
    .update(
      [
        prevHash,
        at.toISOString(),
        e.actor,
        e.action,
        e.keyId ?? '',
        e.detail ? canonicalJson(e.detail) : '',
      ].join('|'),
    )
    .digest('hex');
}
