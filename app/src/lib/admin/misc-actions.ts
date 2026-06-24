"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function resolveMiss(id: string, resolved: boolean): Promise<void> {
  const user = await requireUser();
  await prisma.searchMiss.update({ where: { id }, data: { resolved } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "SearchMiss",
    entityId: id,
    summary: resolved ? "Търсене без резултат → обработено" : "Търсене без резултат → отворено",
  });
  revalidatePath("/admin/search-misses");
}

export async function deleteMiss(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.searchMiss.delete({ where: { id } });
  await logAudit(user, {
    action: "DELETE",
    entity: "SearchMiss",
    entityId: id,
    summary: "Изтрито търсене без резултат",
  });
  revalidatePath("/admin/search-misses");
}
