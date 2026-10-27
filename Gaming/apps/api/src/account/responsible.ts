import { SELF_EXCLUDED_CODE, selfExclusionActive } from "@aso/shared";
import { HttpError } from "../http.js";

/**
 * Отказ при активно самоизключване (отговорна игра). Ползва се от магазина
 * (покупки) — realtime прави същата проверка при влизане в маса/опашка.
 * Fail closed: при съмнение (невалидна дата) приемаме, че изключването трае.
 */
export function assertNotSelfExcluded(user: { selfExcludedUntil?: Date | null }): void {
  const until = user.selfExcludedUntil ?? null;
  if (!selfExclusionActive(until)) return;
  throw new HttpError(
    403,
    SELF_EXCLUDED_CODE,
    "Самоизключването е активно — покупките са спрени до изтичането му",
    { until: until!.toISOString() },
  );
}
