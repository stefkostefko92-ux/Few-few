"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function markHandled(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.contactMessage.update({ where: { id }, data: { handled: true } });
  await audit({
    userEmail: session.sub,
    action: "UPDATE",
    entity: "ContactMessage",
    entityId: id,
    summary: "Съобщението е отбелязано като обработено",
  });
  revalidatePath("/admin/kontakti");
}

export async function deleteContact(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.contactMessage.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "ContactMessage",
    entityId: id,
    summary: "Съобщението е изтрито",
  });
  revalidatePath("/admin/kontakti");
}
