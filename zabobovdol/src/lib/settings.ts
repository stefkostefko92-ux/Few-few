import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";

// Ключове на редактируемите настройки.
export const SETTING_KEYS = {
  adPriceEur: "ad_price_eur",
  revolutUrl: "revolut_url",
  dutyInfo: "duty_info",
  facebookUrl: "facebook_url",
} as const;

// Текст за дежурната аптека/лекар, редактиран свободно от админ панела.
export async function getDutyInfo(): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SETTING_KEYS.dutyInfo },
    });
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export type AdSettings = { priceEur: number; revolutUrl: string };

// Чете рекламните настройки от базата, с резервни стойности от конфигурацията.
export async function getAdSettings(): Promise<AdSettings> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [SETTING_KEYS.adPriceEur, SETTING_KEYS.revolutUrl] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const priceRaw = map.get(SETTING_KEYS.adPriceEur);
    const price = priceRaw ? Number(priceRaw) : NaN;
    return {
      priceEur: Number.isFinite(price) && price > 0 ? price : SITE.payment.monthlyPriceEur,
      revolutUrl: map.get(SETTING_KEYS.revolutUrl) || SITE.payment.revolut,
    };
  } catch {
    return { priceEur: SITE.payment.monthlyPriceEur, revolutUrl: SITE.payment.revolut };
  }
}

// Адрес на Facebook страницата/групата, редактиран от админ панела.
// Връща празен низ, ако не е зададен (тогава иконата не се показва).
export async function getFacebookUrl(): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SETTING_KEYS.facebookUrl },
    });
    return row?.value || SITE.social.facebook || "";
  } catch {
    return SITE.social.facebook || "";
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
