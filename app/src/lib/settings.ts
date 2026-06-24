import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";

// Ключове на редактируемите настройки.
export const SETTING_KEYS = {
  adPriceEur: "ad_price_eur",
  revolutUrl: "revolut_url",
  dutyInfo: "duty_info",
  facebookUrl: "facebook_url",
  churchServices: "church_services",
  wasteSchedule: "waste_schedule",
  googleVerification: "google_site_verification",
  bingVerification: "bing_site_verification",
  indexnowKey: "indexnow_key",
  // Дигитален помощник (AI) — управляем от админ панела, с резервни env стойности.
  chatProvider: "chat_provider",
  geminiApiKey: "gemini_api_key",
  geminiModel: "gemini_model",
  anthropicApiKey: "anthropic_api_key",
  anthropicModel: "anthropic_model",
} as const;

// Кодове за потвърждаване на собствеността в Google Search Console и Bing
// Webmaster Tools (вмъкват се като meta тагове в <head>).
export async function getSeoVerification(): Promise<{ google: string; bing: string }> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [SETTING_KEYS.googleVerification, SETTING_KEYS.bingVerification] } },
    });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    return {
      google: m.get(SETTING_KEYS.googleVerification) || "",
      bing: m.get(SETTING_KEYS.bingVerification) || "",
    };
  } catch {
    return { google: "", bing: "" };
  }
}

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

// Часове на църковните служби (и празници), редактирани свободно от админа.
// Показват се в раздела „Религиозен живот" на страница „Опознай Дупница".
export async function getChurchServices(): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SETTING_KEYS.churchServices },
    });
    return row?.value ?? "";
  } catch {
    return "";
  }
}

// График за сметосъбирането (по квартали/дни), редактиран свободно от админа
// като текст/Markdown. Показва се на страница „График за сметосъбиране".
export async function getWasteSchedule(): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SETTING_KEYS.wasteSchedule },
    });
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
