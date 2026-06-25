"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function setMessageHandled(id: string, handled: boolean): Promise<void> {
  const admin = await requireAdmin();
  await prisma.contactMessage.update({ where: { id }, data: { handled } });
  await logAudit(admin, {
    action: "UPDATE",
    entity: "contactMessage",
    entityId: id,
    summary: handled ? "Съобщение отбелязано като обработено" : "Съобщение върнато като ново",
  });
  revalidatePath("/admin/saobshteniya");
  redirect("/admin/saobshteniya");
}

export async function deleteMessage(id: string): Promise<void> {
  const admin = await requireAdmin();
  await prisma.contactMessage.delete({ where: { id } });
  await logAudit(admin, {
    action: "DELETE",
    entity: "contactMessage",
    entityId: id,
    summary: "Изтрито съобщение от контакти",
  });
  revalidatePath("/admin/saobshteniya");
  redirect("/admin/saobshteniya?deleted=1");
}
