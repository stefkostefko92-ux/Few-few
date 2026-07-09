// @car-monitor/shared — споделени утилити и доменна логика.
// Наследени конвенции от СИГМА: каноничен EUR, флагове ok/review/suspect,
// рисково индексиране green/yellow/red.

export type QualityFlag = "ok" | "review" | "suspect";
export type RiskLevel = "green" | "yellow" | "red";

export type RiskReason =
  | "mileage_rollback"
  | "hidden_accident"
  | "cloned_vin"
  | "price_anomaly"
  | "invalid_vin"
  | "salvage_title";

// --- Валута --------------------------------------------------------------

/**
 * Превръща сума в каноничен EUR. `eurPerUnit` идва от `fx_rates`.
 * За EUR връща сумата без промяна. Връща null при липсващи данни,
 * за да може редът да се маркира като `suspect` (както в СИГМА).
 */
export function toEur(
  amount: number | null | undefined,
  currency: string | null | undefined,
  eurPerUnit?: number | null,
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const cur = (currency ?? "EUR").toUpperCase();
  if (cur === "EUR") return round2(amount);
  if (eurPerUnit == null || !Number.isFinite(eurPerUnit) || eurPerUnit <= 0) {
    return null;
  }
  return round2(amount * eurPerUnit);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatEur(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

// --- Нормализация --------------------------------------------------------

/** Нормализира ЕИК/Булстат до цифри. */
export function normalizeEik(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length ? digits : null;
}

/** Български ЕИК е 9 или 13 цифри. */
export function isValidEik(raw?: string | null): boolean {
  const n = normalizeEik(raw);
  return n != null && (n.length === 9 || n.length === 13);
}

/** Нормализира VIN: главни букви, без I/O/Q, точно 17 символа. */
export function normalizeVin(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  return v.length === 17 ? v : null;
}

export function isValidVin(raw?: string | null): boolean {
  return normalizeVin(raw) != null;
}

/** Нормализира български рег. номер (без интервали, главни). */
export function normalizePlate(raw?: string | null): string | null {
  if (!raw) return null;
  const p = raw.toUpperCase().replace(/\s+/g, "");
  return p.length ? p : null;
}

export function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ключ за модел: "make|model" (lowercase). Аналог на CPV division в СИГМА. */
export function modelKey(make?: string | null, model?: string | null): string | null {
  if (!make || !model) return null;
  return `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
}

// --- Статистика ----------------------------------------------------------

export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : round2((xs[mid - 1]! + xs[mid]!) / 2);
}

// --- Рисково индексиране -------------------------------------------------

export interface RiskInput {
  /** Хронологично подредени отчети за пробег (км). */
  mileageReadings?: Array<{ date: string; km: number }>;
  /** Цена на колата в EUR. */
  priceEur?: number | null;
  /** Медианна цена за модела (от `model_totals`). */
  modelMedianEur?: number | null;
  /** Едно и също VIN активно на повече от едно място едновременно. */
  vinActiveElsewhere?: boolean;
  vinValid?: boolean;
  hasHiddenAccident?: boolean;
}

export interface RiskResult {
  level: RiskLevel;
  reasons: RiskReason[];
  mileageFlag: QualityFlag;
  priceFlag: QualityFlag;
  vinFlag: QualityFlag;
}

const PRICE_ANOMALY_RATIO = 0.6; // под 60% от медианата = подозрително

/**
 * Изчислява рисков профил по същата идея като "suspect" редовете в СИГМА.
 * Червено: твърди сигнали (върнат пробег, клониран VIN, скрита катастрофа).
 * Жълто: меки сигнали (аномална цена, невалиден VIN).
 */
export function computeRisk(input: RiskInput): RiskResult {
  const reasons: RiskReason[] = [];
  let mileageFlag: QualityFlag = "ok";
  let priceFlag: QualityFlag = "ok";
  let vinFlag: QualityFlag = "ok";

  if (detectMileageRollback(input.mileageReadings)) {
    reasons.push("mileage_rollback");
    mileageFlag = "suspect";
  }

  if (input.vinActiveElsewhere) {
    reasons.push("cloned_vin");
    vinFlag = "suspect";
  } else if (input.vinValid === false) {
    reasons.push("invalid_vin");
    vinFlag = "review";
  }

  if (input.hasHiddenAccident) {
    reasons.push("hidden_accident");
  }

  if (
    input.priceEur != null &&
    input.modelMedianEur != null &&
    input.modelMedianEur > 0 &&
    input.priceEur < input.modelMedianEur * PRICE_ANOMALY_RATIO
  ) {
    reasons.push("price_anomaly");
    priceFlag = "review";
  }

  const hardSignals: RiskReason[] = ["mileage_rollback", "cloned_vin", "hidden_accident"];
  const isRed = reasons.some((r) => hardSignals.includes(r));
  const level: RiskLevel = isRed ? "red" : reasons.length > 0 ? "yellow" : "green";

  return { level, reasons, mileageFlag, priceFlag, vinFlag };
}

/** Връща true, ако пробегът намалява във времето (върнат километраж). */
export function detectMileageRollback(
  readings?: Array<{ date: string; km: number }>,
): boolean {
  if (!readings || readings.length < 2) return false;
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    // Толеранс 1000 км за грешки при въвеждане.
    if (sorted[i]!.km + 1000 < sorted[i - 1]!.km) return true;
  }
  return false;
}
