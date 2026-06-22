"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function publishDump(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.dumpReport.update({
    where: { id },
    data: { published: true, status: "CONFIRMED" },
  });
  await audit({
    userEmail: session.sub,
    action: "PUBLISH",
    entity: "DumpReport",
    entityId: id,
    summary: "Сигналът за сметище е публикуван",
  });
  revalidatePath("/admin/smetishta");
}

export async function deleteDump(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.dumpReport.delete({ where: { id } });
  await audit({
    userEmail: session.sub,
    action: "DELETE",
    entity: "DumpReport",
    entityId: id,
    summary: "Сигналът за сметище е изтрит",
  });
  revalidatePath("/admin/smetishta");
}
