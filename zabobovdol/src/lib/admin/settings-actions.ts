"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { setSetting, SETTING_KEYS } from "@/lib/settings";

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
