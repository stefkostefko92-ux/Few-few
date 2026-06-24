"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runSync } from "@/lib/sync/bgclubs";

// Ръчно стартиране на синхронизацията от админ панела („Обнови сега").
export async function runSyncAction(): Promise<void> {
  const admin = await requireAdmin();
  const summary = await runSync();
  await logAudit(admin, {
    action: "UPDATE",
    entity: "sync",
    summary: summary.ok
      ? `Синхронизация: ${summary.matches} мача, ${summary.standings} отбора`
      : `Синхронизация неуспешна: ${summary.error ?? ""}`,
  });
  revalidatePath("/", "layout");
  redirect(`/admin/sinhronizatsiya?${summary.ok ? "ok=1" : "err=1"}`);
}
