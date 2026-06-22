"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function publishListing(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.listing.update({ where: { id }, data: { published: true } });
  await audit({
    userEmail: session.sub,
    action: "PUBLISH",
    entity: "Listing",
    entityId: id,
    summary: "Обявата е публикувана",
  });
  revalidatePath("/admin/obyavi");
  revalidatePath("/obyavi");
}

export async function deleteListing(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.listing.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "Listing",
    entityId: id,
    summary: "Обявата е изтрита",
  });
  revalidatePath("/admin/obyavi");
  revalidatePath("/obyavi");
}
