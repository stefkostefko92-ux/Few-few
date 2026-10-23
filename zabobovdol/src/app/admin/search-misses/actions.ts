"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { guideQuestion } from "@/lib/search-misses";

// Действия върху цяла група изписвания (виж src/lib/search-misses.ts).

const Ids = z.array(z.string().min(1).max(40)).min(1).max(200);

export async function resolveMissGroup(ids: string[], resolved: boolean): Promise<void> {
  const user = await requireUser();
  const list = Ids.parse(ids);
  await prisma.searchMiss.updateMany({ where: { id: { in: list } }, data: { resolved } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "SearchMiss",
    entityId: list[0],
    summary: resolved
      ? `Търсения без резултат → решено (${list.length})`
      : `Търсения без резултат → отново отворени (${list.length})`,
  });
  revalidatePath("/admin/search-misses");
}

export async function deleteMissGroup(ids: string[]): Promise<void> {
  const user = await requireUser();
  const list = Ids.parse(ids);
  await prisma.searchMiss.deleteMany({ where: { id: { in: list } } });
  await logAudit(user, {
    action: "DELETE",
    entity: "SearchMiss",
    entityId: list[0],
    summary: `Изтрити търсения без резултат (${list.length})`,
  });
  revalidatePath("/admin/search-misses");
}

// „Създай ръководство“: отбелязва нуждата като решена и отваря нов запис
// „Как да…“ с предложен въпрос (?question=…). Ако редакторът се откаже —
// „Върни като ново“ я отваря пак.
export async function startGuideFromMiss(ids: string[], query: string): Promise<void> {
  const user = await requireUser();
  const list = Ids.parse(ids);
  const q = guideQuestion(z.string().max(200).parse(query));
  await prisma.searchMiss.updateMany({ where: { id: { in: list } }, data: { resolved: true } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "SearchMiss",
    entityId: list[0],
    summary: `Търсене без резултат → ново ръководство „${q.slice(0, 80)}“`,
  });
  revalidatePath("/admin/search-misses");
  redirect(q ? `/admin/faq/new?question=${encodeURIComponent(q)}` : "/admin/faq/new");
}
