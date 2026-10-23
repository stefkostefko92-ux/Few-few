"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ingestMunicipalityNews, MUNICIPALITY_SOURCE } from "@/lib/ingest-news";
import { isNotNewsDraft, newsPatterns } from "@/app/admin/novini/drafts";

export async function runNewsImport(): Promise<void> {
  const user = await requireUser();
  const res = await ingestMunicipalityNews(15);
  const extra = [
    res.pending !== undefined ? `, чакат преглед ${res.pending}` : "",
    res.withoutDate ? `, без дата (не са внесени) ${res.withoutDate}` : "",
  ].join("");
  await logAudit(user, {
    action: "CREATE",
    entity: "Post",
    summary: `Внасяне на новини от общината: нови ${res.created}, пропуснати ${res.skipped}${extra}${res.error ? " (грешка: " + res.error + ")" : ""}`,
  });
  revalidatePath("/admin/novini");
  const params = new URLSearchParams({
    created: String(res.created),
    skipped: String(res.skipped),
    found: String(res.found),
  });
  if (res.pending !== undefined) params.set("pending", String(res.pending));
  if (res.withoutDate !== undefined) params.set("withoutDate", String(res.withoutDate));
  if (res.error) params.set("error", res.error);
  redirect(`/admin/novini?${params.toString()}`);
}

// id-тата идват от страницата (вързани към бутона), но не им вярваме: всеки запис
// се проверява наново тук — само непубликувани, внесени от общината и с адрес,
// който НЕ е на новина. Всичко друго се пропуска, не се трие.
const IdsSchema = z.array(z.string().regex(/^[a-z0-9]{1,64}$/i)).min(1).max(200);

export async function deleteNotNewsDrafts(ids: string[]): Promise<void> {
  // Изтриването е окончателно — само администратор (собственикът решава).
  const user = await requireAdmin();
  const parsed = IdsSchema.safeParse(ids);
  if (!parsed.success) redirect("/admin/novini?removed=0");

  const rows = await prisma.post.findMany({
    where: { id: { in: parsed.data }, published: false, source: MUNICIPALITY_SOURCE },
    select: { id: true, title: true, source: true, sourceUrl: true },
  });
  const patterns = newsPatterns(process.env.MUNICIPALITY_NEWS_LINK_PATTERN);
  const doomed = rows.filter((r) => isNotNewsDraft(r, patterns));

  let removed = 0;
  if (doomed.length > 0) {
    const res = await prisma.post.deleteMany({
      // published:false още веднъж — ако някой го е публикувал междувременно, остава.
      where: { id: { in: doomed.map((r) => r.id) }, published: false },
    });
    removed = res.count;
    const titles = doomed.map((r) => `„${r.title}“`).join(", ");
    const what =
      removed === 1
        ? "1 внесена страница от сайта на общината, която не е новина"
        : `${removed} внесени страници от сайта на общината, които не са новини`;
    await logAudit(user, {
      action: "DELETE",
      entity: "Post",
      summary: `Изтриване на ${what}: ${titles.length > 600 ? titles.slice(0, 600) + "…" : titles}`,
    });
  }

  revalidatePath("/admin/novini");
  redirect(`/admin/novini?removed=${removed}`);
}
