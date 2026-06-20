// @car-monitor/config — централизирана конфигурация (по модела на @sigma/config).

export interface SourceConfig {
  id: string; // listings | kat | gtp | insurer | rapex
  label: string;
  baseUrl?: string;
  enabled: boolean;
}

/** Източници на данни за ETL. Аналог на EOP емисията в СИГМА. */
export const SOURCES: SourceConfig[] = [
  { id: "listings", label: "Пазарни обяви", enabled: true },
  { id: "kat", label: "КАТ регистрации", enabled: false }, // изисква споразумение
  { id: "gtp", label: "ГТП прегледи", enabled: false }, // изисква споразумение
  { id: "insurer", label: "Застрахователи / Гаранционен фонд", enabled: false },
  { id: "rapex", label: "EU Safety Gate (recalls)", enabled: true },
];

export interface RuntimeConfig {
  /** Базов EUR курс източник. */
  fxSource: string;
  /** Cron за ETL refresh (всеки 6 часа, както в СИГМА). */
  refreshCron: string;
  /** Колко скорошен прозорец да обработва инкременталният refresh (дни). */
  refreshWindowDays: number;
  /** Под този дял от медианата цената се смята за аномална. */
  priceAnomalyRatio: number;
}

export const config: RuntimeConfig = {
  fxSource: "bnb",
  refreshCron: "0 */6 * * *",
  refreshWindowDays: 3,
  priceAnomalyRatio: 0.6,
};

/** Чете низова env променлива с по подразбиране. */
export function env(vars: Record<string, string | undefined>, key: string, fallback: string): string {
  const v = vars[key];
  return v == null || v === "" ? fallback : v;
}
