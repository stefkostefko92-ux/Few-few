"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function publishRide(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.rideshare.update({ where: { id }, data: { published: true } });
  await audit({ userEmail: session.sub, action: "PUBLISH", entity: "Rideshare", entityId: id, summary: "Обявата е публикувана" });
  revalidatePath("/admin/spodeleno-patuvane");
  revalidatePath("/spodeleno-patuvane");
}

export async function deleteRide(fd: FormData) {
  const session = await requireSession();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await prisma.rideshare.delete({ where: { id } });
  await audit({ userEmail: session.sub, action: "DELETE", entity: "Rideshare", entityId: id, summary: "Обявата е изтрита" });
  revalidatePath("/admin/spodeleno-patuvane");
  revalidatePath("/spodeleno-patuvane");
}
