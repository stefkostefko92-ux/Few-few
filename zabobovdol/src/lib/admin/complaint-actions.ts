"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { MUNICIPALITY_EMAIL } from "@/lib/mail";

type Status = "NEW" | "FORWARDED" | "RESOLVED" | "REJECTED";

export async function setComplaintStatus(id: string, status: Status): Promise<void> {
  const user = await requireUser();
  const data: Record<string, unknown> = { status };
  if (status === "FORWARDED") data.forwardedTo = MUNICIPALITY_EMAIL;
  await prisma.complaint.update({ where: { id }, data });
  await logAudit(user, {
    action: "UPDATE",
    entity: "Complaint",
    entityId: id,
    summary: `Сигнал → статус ${status}`,
  });
  revalidatePath("/admin/signali");
}

export async function deleteComplaint(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.complaint.delete({ where: { id } });
  await logAudit(user, {
    action: "DELETE",
    entity: "Complaint",
    entityId: id,
    summary: "Изтрит сигнал",
  });
  revalidatePath("/admin/signali");
}
