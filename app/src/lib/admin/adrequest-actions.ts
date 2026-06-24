"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Status = "NEW" | "CONTACTED" | "PAID" | "ACTIVE" | "REJECTED";

export async function setAdRequestStatus(id: string, status: Status): Promise<void> {
  const user = await requireAdmin();
  await prisma.adRequest.update({ where: { id }, data: { status } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "AdRequest",
    entityId: id,
    summary: `Заявка за реклама → ${status}`,
  });
  revalidatePath("/admin/reklami");
}

export async function deleteAdRequest(id: string): Promise<void> {
  const user = await requireAdmin();
  await prisma.adRequest.delete({ where: { id } });
  await logAudit(user, {
    action: "DELETE",
    entity: "AdRequest",
    entityId: id,
    summary: "Изтрита заявка за реклама",
  });
  revalidatePath("/admin/reklami");
}
