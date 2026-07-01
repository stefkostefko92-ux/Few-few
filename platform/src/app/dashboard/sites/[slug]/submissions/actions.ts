"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

// Отбелязва заявка като обработена/необработена (само MANAGER, скоуп по сайт).
export async function toggleSubmissionAction(
  slug: string,
  submissionId: string,
): Promise<void> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return;
  const sub = await prisma.formSubmission.findFirst({
    where: { id: submissionId, siteId: found.site.id },
  });
  if (!sub) return;
  await prisma.formSubmission.update({
    where: { id: sub.id },
    data: { handled: !sub.handled },
  });
  revalidatePath(`/dashboard/sites/${slug}/submissions`);
}

export async function deleteSubmissionAction(
  slug: string,
  submissionId: string,
): Promise<void> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return;
  await prisma.formSubmission.deleteMany({
    where: { id: submissionId, siteId: found.site.id },
  });
  revalidatePath(`/dashboard/sites/${slug}/submissions`);
}
