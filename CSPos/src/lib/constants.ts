// Константи от нормативната уредба.
// Източници: Наредба Н-18 чл. 26/27/31, ЗВЕРБ чл. 12–13/16/20, Регламент 1103/97.
// Подробният правен анализ: docs/COMPLIANCE.md

/** Фиксиран курс лев/евро — не се закръглява, не се съкращава (чл. 12 ЗВЕРБ). */
export const BGN_PER_EUR = 1.95583;

/** Край на задължителното двойно обозначаване (ЗВЕРБ, изм. юли 2025). */
export const DUAL_DISPLAY_END = "2026-08-08";

/** Данъчни групи по чл. 27 от Наредба Н-18. ВНИМАНИЕ: В = течни горива, Г = 9%. */
export const VAT_GROUPS = {
  A: { letter: "А", label: "Освободени / 0%", defaultRatePermille: 0 },
  B: { letter: "Б", label: "Стандартна ставка 20%", defaultRatePermille: 200 },
  C: { letter: "В", label: "Течни горива 20%", defaultRatePermille: 200 },
  D: { letter: "Г", label: "Намалена ставка 9%", defaultRatePermille: 90 },
} as const;

export type VatGroupKey = keyof typeof VAT_GROUPS;

export const ROLES = {
  ADMIN: "Администратор",
  MANAGER: "Управител",
  CASHIER: "Касиер",
} as const;

export type RoleKey = keyof typeof ROLES;

/** Причини за сторно по чл. 31 от Наредба Н-18. */
export const STORNO_REASONS = {
  OPERATOR_ERROR: "Операторска грешка",
  RETURN: "Връщане / рекламация",
  TAX_BASE_CUT: "Намаление на данъчната основа",
} as const;

export type StornoReasonKey = keyof typeof STORNO_REASONS;

export const PAYMENT_TYPES = {
  CASH: "В брой",
  CARD: "С карта",
  MIXED: "Смесено",
  CREDIT: "Вересия (отложено плащане)",
} as const;

export type PaymentTypeKey = keyof typeof PAYMENT_TYPES;

export const UNITS = {
  PCS: { label: "бр.", decimals: 0 },
  KG: { label: "кг", decimals: 3 },
} as const;

export type UnitKey = keyof typeof UNITS;

export const STOCK_MOVEMENT_TYPES = {
  SALE: "Продажба",
  STORNO: "Сторно",
  DELIVERY: "Доставка",
  STOCKTAKE: "Ревизия",
  WRITEOFF: "Брак",
  MANUAL: "Ръчна корекция",
} as const;

/** Сесийна бисквитка. */
export const SESSION_COOKIE = "cspos_session";
export const SESSION_TTL_HOURS = 14; // една дълга смяна

/**
 * Служебни артикули (PLU ≥ 990): свободна продажба по ДДС група и др.
 * Скенируеми са, но не се показват в каталога на POS екрана, нито в
 * алармата за изчерпващи се наличности (нямат реален склад).
 */
export const SERVICE_PLU_MIN = 990;

/** Наименование и версия на софтуера — идентификация по Прил. № 29 Н-18. */
export const APP_NAME = "Carbon Stealth POS";
export const APP_VERSION = "1.0.0";
