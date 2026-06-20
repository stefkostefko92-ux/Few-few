"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { submitToIndexNow } from "@/lib/indexnow";

// Кодове за потвърждаване на собствеността в Google Search Console / Bing.
export async function saveSeoVerification(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const google = String(formData.get("google") ?? "").trim();
  const bing = String(formData.get("bing") ?? "").trim();

  await setSetting(SETTING_KEYS.googleVerification, google);
  await setSetting(SETTING_KEYS.bingVerification, bing);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: "Промяна на кодове за верификация в търсачки",
  });

  revalidatePath("/", "layout");
  redirect("/admin/indeksirane?saved=1");
}

// Уведомява търсачките (IndexNow) за всички страници на сайта.
export async function notifySearchEngines(): Promise<void> {
  const admin = await requireAdmin();
  const res = await submitToIndexNow();

  await logAudit(admin, {
    action: "UPDATE",
    entity: "Sitemap",
    summary: res.ok
      ? `Уведомени търсачки (IndexNow): ${res.submitted} адреса`
      : `Неуспешно уведомяване на търсачки: ${res.error ?? "грешка"}`,
  });

  const q = res.ok
    ? `inx=ok&n=${res.submitted}`
    : `inx=err&msg=${encodeURIComponent(res.error ?? "Грешка")}`;
  redirect(`/admin/indeksirane?${q}`);
}

export async function saveAdSettings(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const priceRaw = String(formData.get("priceEur") ?? "").trim().replace(",", ".");
  const price = Number(priceRaw);
  const revolut = String(formData.get("revolutUrl") ?? "").trim();

  if (!Number.isFinite(price) || price <= 0) {
    redirect("/admin/nastroyki?error=" + encodeURIComponent("Въведете валидна сума (число)."));
  }
  if (revolut && !/^https?:\/\//i.test(revolut)) {
    redirect("/admin/nastroyki?error=" + encodeURIComponent("Линкът трябва да започва с http(s)://"));
  }

  await setSetting(SETTING_KEYS.adPriceEur, String(price));
  await setSetting(SETTING_KEYS.revolutUrl, revolut);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: `Промяна на рекламни настройки (цена ${price}€)`,
  });

  revalidatePath("/", "layout");
  redirect("/admin/nastroyki?saved=1");
}

export async function saveContactSettings(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const facebook = String(formData.get("facebookUrl") ?? "").trim();

  if (facebook && !/^https?:\/\//i.test(facebook)) {
    redirect("/admin/nastroyki?error=" + encodeURIComponent("Линкът трябва да започва с http(s)://"));
  }

  await setSetting(SETTING_KEYS.facebookUrl, facebook);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: "Промяна на връзка към Facebook",
  });

  revalidatePath("/", "layout");
  redirect("/admin/nastroyki?saved=1");
}

export async function saveChurchServices(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const info = String(formData.get("churchServices") ?? "").trim();

  await setSetting(SETTING_KEYS.churchServices, info);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: "Промяна на часовете на църковните служби",
  });

  revalidatePath("/", "layout");
  redirect("/admin/nastroyki?saved=1");
}

export async function saveWasteSchedule(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const info = String(formData.get("wasteSchedule") ?? "").trim();

  await setSetting(SETTING_KEYS.wasteSchedule, info);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: "Промяна на графика за сметосъбиране",
  });

  revalidatePath("/", "layout");
  redirect("/admin/nastroyki?saved=1");
}

export async function saveDutyInfo(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const info = String(formData.get("dutyInfo") ?? "").trim();

  await setSetting(SETTING_KEYS.dutyInfo, info);

  await logAudit(admin, {
    action: "UPDATE",
    entity: "SiteSetting",
    summary: "Промяна на информацията за дежурна аптека",
  });

  revalidatePath("/", "layout");
  redirect("/admin/nastroyki?saved=1");
}
