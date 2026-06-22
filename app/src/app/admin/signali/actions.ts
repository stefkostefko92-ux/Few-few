"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function resolveComplaint(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.complaint.update({ where: { id }, data: { status: "RESOLVED" } });
  await audit({
    userEmail: session.sub,
    action: "RESOLVE",
    entity: "Complaint",
    entityId: id,
    summary: "Сигналът е отбелязан като решен",
  });
  revalidatePath("/admin/signali");
}

export async function deleteComplaint(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.complaint.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "Complaint",
    entityId: id,
    summary: "Сигналът е изтрит",
  });
  revalidatePath("/admin/signali");
}
