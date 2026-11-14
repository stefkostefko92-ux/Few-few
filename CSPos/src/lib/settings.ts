// Типизиран достъп до таблица Setting (key → JSON).

import { prisma } from "./db";
import { DEFAULT_MASK_RULES, type BarcodeMaskRule } from "./barcode";
import { DEFAULT_VAT_RATES, type VatRates } from "./vat";
import { DUAL_DISPLAY_END } from "./constants";

export interface StoreInfo {
  name: string; // юридическо лице (пълно наименование)
  eik: string;
  vatNumber: string; // ЗДДС номер (или празно, ако няма регистрация)
  mol: string; // МОЛ / представляващ — „Съставил“ на фактурата (чл. 114 ЗДДС)
  code: string; // код на търговския обект (т. 18.1, 18.9)
  storeName: string; // име на търговския обект
  address: string; // адрес на обекта
  city: string;
  phone: string; // контакт (по избор — на бона/фактурата)
  footerText: string; // благодарствен текст на дъното на бона (по избор)
}

export interface FiscalConfig {
  driver: "demo" | "erpnet" | "tremol" | "datecs-lan";
  /** Индивидуален номер на ФУ (8 знака) — влиза в УНП. */
  deviceSerial: string;
  /** Фискален номер на паметта (на бона). */
  fiscalMemoryNumber: string;
  host: string; // ErpNet.FP / ZFPLab / устройство по LAN
  port: number;
  printerId: string; // за ErpNet.FP
  /**
   * Режим СУПТО (Прил. № 29): УНП на всеки бон, без демо драйвери (т. 20). Веднъж включен,
   * не може да се изключи (т. 10). Нова инсталация е в демонстрация — режимът е изключен.
   */
  suptoMode: boolean;
  /** Кога е включен режимът СУПТО (ISO) — за „За програмата“ и декларацията. */
  suptoSince?: string | null;
}

export interface TerminalConfig {
  driver: "demo" | "mypos-ecr" | "sumup" | "borica" | "none";
  host: string;
  port: number;
  apiKey: string; // SumUp
  merchantCode: string;
  readerId: string;
}

export interface WorkplaceConfig {
  /** Код на работното място (т. 18.1, 18.9) — една инсталация = едно работно място. */
  code: string;
  name: string;
}

export interface PosPolicy {
  /** Ръчна отстъпка, която касиер може да даде без управител (промили; 100 = 10 %). */
  maxCashierDiscountPermille: number;
}

/** Последна успешна връзка с ФУ (т. 8) и сверка на часа (т. 5). */
export interface FiscalLinkState {
  serial: string;
  okAt: string | null;
  detail: string;
  offsetMs: number | null;
  syncedAt: string | null;
}

export interface DisplayConfig {
  /** Двойно обозначаване EUR/BGN — задължително до 08.08.2026 (ЗВЕРБ). */
  dualDisplay: boolean;
  dualDisplayEnd: string; // ISO дата
}

const DEFAULTS = {
  store: {
    name: "Демо Търговец ЕООД",
    eik: "000000000",
    vatNumber: "BG000000000",
    mol: "Иван Иванов",
    code: "1",
    storeName: "Хранителен магазин „Касата“",
    address: "ул. „Демо“ № 1",
    city: "София",
    phone: "",
    footerText: "Благодарим Ви за покупката!",
  } satisfies StoreInfo,
  fiscal: {
    driver: "demo",
    deviceSerial: "DM000001",
    fiscalMemoryNumber: "00000001",
    host: "127.0.0.1",
    port: 8001,
    printerId: "1",
    suptoMode: false,
    suptoSince: null,
  } as FiscalConfig,
  terminal: {
    driver: "demo",
    host: "192.168.1.100",
    port: 7900,
    apiKey: "",
    merchantCode: "",
    readerId: "",
  } as TerminalConfig,
  display: {
    dualDisplay: true,
    dualDisplayEnd: DUAL_DISPLAY_END,
  } satisfies DisplayConfig,
  workplace: { code: "1", name: "Каса 1" } satisfies WorkplaceConfig,
  pos: { maxCashierDiscountPermille: 100 } satisfies PosPolicy,
  fiscalLink: { serial: "", okAt: null, detail: "", offsetMs: null, syncedAt: null } as FiscalLinkState,
  vatRates: DEFAULT_VAT_RATES,
  barcodeMasks: DEFAULT_MASK_RULES,
  /** Лиценз на тази каса: ключ + подписан офлайн blob + локален deviceId. */
  license: { key: "", blob: "", deviceId: "" },
};

export type SettingKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingKey>(
  key: K
): Promise<(typeof DEFAULTS)[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return DEFAULTS[key];
  try {
    // сливане с подразбиранията — нови полета получават стойност при ъпдейт
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed as (typeof DEFAULTS)[K];
    return { ...(DEFAULTS[key] as object), ...parsed } as (typeof DEFAULTS)[K];
  } catch {
    return DEFAULTS[key];
  }
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: (typeof DEFAULTS)[K]
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

export async function getVatRates(): Promise<VatRates> {
  return getSetting("vatRates");
}

export async function getBarcodeMasks(): Promise<BarcodeMaskRule[]> {
  return getSetting("barcodeMasks");
}

/** Активно ли е двойното обозначаване днес (флаг + крайна дата). */
export async function isDualDisplayActive(): Promise<boolean> {
  const d = await getSetting("display");
  if (!d.dualDisplay) return false;
  return new Date().toISOString().slice(0, 10) <= d.dualDisplayEnd;
}
