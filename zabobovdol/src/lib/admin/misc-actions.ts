"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function resolveMiss(id: string, resolved: boolean): Promise<void> {
  await requireUser();
  await prisma.searchMiss.update({ where: { id }, data: { resolved } });
  revalidatePath("/admin/search-misses");
}

export async function deleteMiss(id: string): Promise<void> {
  await requireUser();
  await prisma.searchMiss.delete({ where: { id } });
  revalidatePath("/admin/search-misses");
}
