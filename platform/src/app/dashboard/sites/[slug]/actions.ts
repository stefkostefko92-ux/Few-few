"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  runHealthCheck,
  syncSiteContent,
  pushSiteContent,
  triggerDeploy,
} from "@/lib/sites";
import { logAudit } from "@/lib/audit";
import { linkSchema } from "@/lib/validation";

export type ActionResult = { ok?: string; error?: string };

// Редакция на елемент от съдържанието на самия свързан сайт. Заглавие по избор;
// статус — само познати стойности (за да не пращаме боклук към чуждото API).
const contentEditSchema = z.object({
  title: z.string().trim().min(1, "Заглавието е задължително.").max(300).optional(),
  status: z.enum(["published", "draft"]).optional(),
});

// Здравна проверка (нужен е поне четящ достъп — това е безопасно действие,
// но го ограничаваме до MANAGER, за да не товарят VIEWER-и външния сайт).
export async function checkNowAction(slug: string): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  try {
    const r = await runHealthCheck(found.site);
    await logAudit(user, {
      action: "CHECK",
      entity: "Site",
      entityId: found.site.id,
      summary: `Проверка на ${found.site.name}: ${r.ok ? "OK" : "неуспех"}`,
    });
    revalidatePath(`/dashboard/sites/${slug}`);
    return { ok: r.ok ? "Сайтът отговаря." : `Проблем: ${r.error ?? "неуспех"}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Грешка при проверката." };
  }
}

export async function syncContentAction(slug: string): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  try {
    const n = await syncSiteContent(found.site);
    await logAudit(user, {
      action: "SYNC",
      entity: "Site",
      entityId: found.site.id,
      summary: `Синхронизирано съдържание (${n}) за ${found.site.name}`,
    });
    revalidatePath(`/dashboard/sites/${slug}`);
    return { ok: `Синхронизирани ${n} записа.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Грешка при синхронизацията." };
  }
}

export async function deployAction(slug: string): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  const dep = await prisma.deployment.create({
    data: {
      siteId: found.site.id,
      status: "RUNNING",
      triggeredByEmail: user.email,
    },
  });
  try {
    const ok = await triggerDeploy(found.site);
    await prisma.deployment.update({
      where: { id: dep.id },
      data: { status: ok ? "SUCCESS" : "FAILED", finishedAt: new Date() },
    });
    await logAudit(user, {
      action: "DEPLOY",
      entity: "Site",
      entityId: found.site.id,
      summary: `Деплой на ${found.site.name}: ${ok ? "приет" : "отказан"}`,
    });
    revalidatePath(`/dashboard/sites/${slug}`);
    return ok
      ? { ok: "Деплоят е задействан." }
      : { error: "Сайтът отказа деплоя." };
  } catch (err) {
    await prisma.deployment.update({
      where: { id: dep.id },
      data: {
        status: "FAILED",
        message: err instanceof Error ? err.message : null,
        finishedAt: new Date(),
      },
    });
    revalidatePath(`/dashboard/sites/${slug}`);
    return { error: err instanceof Error ? err.message : "Грешка при деплоя." };
  }
}

export async function addLinkAction(
  slug: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  const parsed = linkSchema.safeParse({
    label: formData.get("label"),
    url: formData.get("url"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  await prisma.siteLink.create({
    data: {
      siteId: found.site.id,
      label: parsed.data.label,
      url: parsed.data.url,
      note: parsed.data.note || null,
    },
  });
  revalidatePath(`/dashboard/sites/${slug}`);
  return { ok: "Връзката е добавена." };
}

export async function deleteLinkAction(
  slug: string,
  linkId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  // Гарантираме, че връзката е на този сайт (без изтичане между сайтове).
  await prisma.siteLink.deleteMany({
    where: { id: linkId, siteId: found.site.id },
  });
  revalidatePath(`/dashboard/sites/${slug}`);
  return { ok: "Изтрито." };
}

// Записва промяна (заглавие/статус) в елемент от съдържанието на свързания сайт.
// MANAGER скоуп. externalId се проверява, че принадлежи на този сайт, преди PUT.
export async function updateExternalContentAction(
  slug: string,
  externalId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  // Елементът трябва да е вече синхронизиран за този сайт (без обхождане на чужди id-та).
  const item = await prisma.contentItem.findFirst({
    where: { siteId: found.site.id, externalId },
    select: { id: true },
  });
  if (!item) return { error: "Елементът не е намерен за този сайт." };

  const rawTitle = formData.get("title");
  const rawStatus = formData.get("status");
  const parsed = contentEditSchema.safeParse({
    title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : undefined,
    status: typeof rawStatus === "string" && rawStatus ? rawStatus : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  if (parsed.data.title === undefined && parsed.data.status === undefined) {
    return { error: "Няма промени за запис." };
  }

  try {
    await pushSiteContent(found.site, externalId, parsed.data);
    await logAudit(user, {
      action: "UPDATE",
      entity: "Site",
      entityId: found.site.id,
      summary: `Редакция на съдържание „${externalId}" в ${found.site.name}`,
    });
    revalidatePath(`/dashboard/sites/${slug}`);
    return { ok: "Промяната е записана в сайта." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Грешка при записа." };
  }
}
