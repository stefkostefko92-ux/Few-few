"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ingestMunicipalityNews } from "@/lib/ingest-news";

export async function runNewsImport(): Promise<void> {
  const user = await requireUser();
  const res = await ingestMunicipalityNews(15);
  await logAudit(user, {
    action: "CREATE",
    entity: "Post",
    summary: `Внасяне на новини от общината: нови ${res.created}, пропуснати ${res.skipped}${res.error ? " (грешка: " + res.error + ")" : ""}`,
  });
  revalidatePath("/admin/novini");
  const params = new URLSearchParams({
    created: String(res.created),
    skipped: String(res.skipped),
    found: String(res.found),
  });
  if (res.error) params.set("error", res.error);
  redirect(`/admin/novini?${params.toString()}`);
}
