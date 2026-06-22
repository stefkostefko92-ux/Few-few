"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function markContacted(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.adRequest.update({ where: { id }, data: { status: "CONTACTED" } });
  await audit({ userEmail: session.sub, action: "UPDATE", entity: "AdRequest", entityId: id, summary: "Свързахме се" });
  revalidatePath("/admin/reklama");
}

export async function deleteAd(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.adRequest.delete({ where: { id } });
  await audit({ userEmail: session.sub, action: "DELETE", entity: "AdRequest", entityId: id, summary: "Заявката е изтрита" });
  revalidatePath("/admin/reklama");
}
