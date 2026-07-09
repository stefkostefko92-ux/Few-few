// @car-monitor/config — централизирана конфигурация (по модела на @sigma/config).

export interface SourceConfig {
  id: string; // listings | mobile_bg | cars_bg | kat | gtp | insurer | rapex
  label: string;
  baseUrl?: string;
  /** Стойност по подразбиране; може да се override-не през env (feature flag). */
  enabled: boolean;
}

/** Източници на данни за ETL. Аналог на EOP емисията в СИГМА. */
export const SOURCES: SourceConfig[] = [
  // Пазарни обяви — публични/scrape-ваеми. Изключени по подразбиране зад feature flag.
  { id: "mobile_bg", label: "mobile.bg обяви", baseUrl: "https://www.mobile.bg", enabled: false },
  { id: "cars_bg", label: "cars.bg обяви", baseUrl: "https://www.cars.bg", enabled: false },
  // Институционални — изискват споразумение (production secrets).
  { id: "kat", label: "КАТ регистрации", enabled: false },
  { id: "gtp", label: "ГТП прегледи", enabled: false },
  { id: "insurer", label: "Застрахователи / Гаранционен фонд", enabled: false },
  { id: "rapex", label: "EU Safety Gate (recalls)", enabled: false },
];

/**
 * Feature flag: дали източникът е активен. Override през env променлива
 * `SOURCE_<ID>` (напр. SOURCE_MOBILE_BG=1). Без override — стойността от SOURCES.
 */
export function sourceEnabled(id: string, vars: Record<string, string | undefined> = {}): boolean {
  const raw = vars[`SOURCE_${id.toUpperCase()}`];
  if (raw != null && raw !== "") return raw === "1" || raw.toLowerCase() === "true";
  return SOURCES.find((s) => s.id === id)?.enabled ?? false;
}

export interface RuntimeConfig {
  /** Базов EUR курс източник. */
  fxSource: string;
  /** Cron за ETL refresh (всеки 6 часа, както в СИГМА). */
  refreshCron: string;
  /** Колко скорошен прозорец да обработва инкременталният refresh (дни). */
  refreshWindowDays: number;
  /** Под този дял от медианата цената се смята за аномална. */
  priceAnomalyRatio: number;
  /** Максимален брой страници на адаптер за един refresh. */
  maxPagesPerRun: number;
  /** Учтива пауза между HTTP заявките (ms). */
  requestDelayMs: number;
}

export const config: RuntimeConfig = {
  fxSource: "bnb",
  refreshCron: "0 */6 * * *",
  refreshWindowDays: 3,
  priceAnomalyRatio: 0.6,
  maxPagesPerRun: 5,
  requestDelayMs: 1500,
};

/** Чете низова env променлива с по подразбиране. */
export function env(vars: Record<string, string | undefined>, key: string, fallback: string): string {
  const v = vars[key];
  return v == null || v === "" ? fallback : v;
}
