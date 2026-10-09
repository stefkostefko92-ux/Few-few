/** Резултат на операция от работното пространство: стойност или стабилен код за API грешка. */
export type Result<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(status: number, code: string): Result<T> => ({
  ok: false,
  status,
  code,
});
