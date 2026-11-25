// Правилото за НОВА парола — едно за регистрация, смяна, възстановяване и админ (чисто).
import { z } from 'zod';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export const newPasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
export const RESET_TTL_MS = 60 * 60 * 1000;

export type NewPasswordResult = { ok: true; password: string } | { ok: false; reason: 'weak' | 'mismatch' };

/** Нова парола + повторение от формата. */
export function parseNewPassword(next: unknown, confirm: unknown): NewPasswordResult {
  const parsed = newPasswordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, reason: 'weak' };
  if (parsed.data !== String(confirm ?? '')) return { ok: false, reason: 'mismatch' };
  return { ok: true, password: parsed.data };
}
