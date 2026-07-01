"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import {
  siteCreateSchema,
  userCreateSchema,
  membershipSchema,
} from "@/lib/validation";

export type FormResult = { ok?: string; error?: string };

// ---------- Сайтове ----------

export async function createSiteAction(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const owner = await requireOwner();
  const parsed = siteCreateSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    url: formData.get("url"),
    apiBaseUrl: formData.get("apiBaseUrl"),
    apiKey: formData.get("apiKey"),
    deployHookUrl: formData.get("deployHookUrl"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

  const existing = await prisma.site.findUnique({ where: { slug: d.slug } });
  if (existing) return { error: "Вече има сайт с този идентификатор (slug)." };

  const site = await prisma.site.create({
    data: {
      name: d.name,
      slug: d.slug,
      url: d.url,
      apiBaseUrl: d.apiBaseUrl || null,
      apiKeyEnc: d.apiKey ? encryptSecret(d.apiKey) : null,
      deployHookUrl: d.deployHookUrl || null,
      notes: d.notes || null,
    },
  });
  await logAudit(owner, {
    action: "CREATE",
    entity: "Site",
    entityId: site.id,
    summary: `Свързан сайт ${site.name}`,
  });
  redirect(`/admin/sites/${site.id}`);
}

export async function updateSiteAction(
  siteId: string,
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const owner = await requireOwner();
  const parsed = siteCreateSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    url: formData.get("url"),
    apiBaseUrl: formData.get("apiBaseUrl"),
    apiKey: formData.get("apiKey"),
    deployHookUrl: formData.get("deployHookUrl"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;

  const clash = await prisma.site.findFirst({
    where: { slug: d.slug, NOT: { id: siteId } },
  });
  if (clash) return { error: "Друг сайт вече ползва този идентификатор (slug)." };

  await prisma.site.update({
    where: { id: siteId },
    data: {
      name: d.name,
      slug: d.slug,
      url: d.url,
      apiBaseUrl: d.apiBaseUrl || null,
      deployHookUrl: d.deployHookUrl || null,
      notes: d.notes || null,
      // Ключът се сменя само ако е въведена нова стойност (празно = без промяна).
      ...(d.apiKey ? { apiKeyEnc: encryptSecret(d.apiKey) } : {}),
    },
  });
  await logAudit(owner, {
    action: "UPDATE",
    entity: "Site",
    entityId: siteId,
    summary: `Обновен сайт ${d.name}`,
  });
  revalidatePath(`/admin/sites/${siteId}`);
  return { ok: "Запазено." };
}

export async function deleteSiteAction(siteId: string): Promise<void> {
  const owner = await requireOwner();
  const site = await prisma.site.delete({ where: { id: siteId } });
  await logAudit(owner, {
    action: "DELETE",
    entity: "Site",
    entityId: siteId,
    summary: `Изтрит сайт ${site.name}`,
  });
  redirect("/admin/sites");
}

export async function toggleMonitorAction(siteId: string): Promise<void> {
  await requireOwner();
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return;
  await prisma.site.update({
    where: { id: siteId },
    data: {
      monitorEnabled: !site.monitorEnabled,
      status: !site.monitorEnabled ? "UNKNOWN" : "PAUSED",
    },
  });
  revalidatePath(`/admin/sites/${siteId}`);
}

// ---------- Потребители ----------

export async function createUserAction(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const owner = await requireOwner();
  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") || "MEMBER",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Невалидни данни." };
  }
  const d = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) return { error: "Вече има потребител с този имейл." };

  const user = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      passwordHash: await hashPassword(d.password),
      role: d.role,
    },
  });
  await logAudit(owner, {
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    summary: `Създаден акаунт ${user.email} (${user.role})`,
  });
  revalidatePath("/admin/users");
  return { ok: `Акаунтът ${d.email} е създаден.` };
}

export async function toggleUserActiveAction(userId: string): Promise<void> {
  const owner = await requireOwner();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.id === owner.id) return; // не деактивирай себе си
  await prisma.user.update({
    where: { id: userId },
    data: { active: !user.active },
  });
  revalidatePath("/admin/users");
}

export async function deleteUserAction(userId: string): Promise<void> {
  const owner = await requireOwner();
  if (userId === owner.id) return; // не изтривай себе си
  const user = await prisma.user.delete({ where: { id: userId } });
  await logAudit(owner, {
    action: "DELETE",
    entity: "User",
    entityId: userId,
    summary: `Изтрит акаунт ${user.email}`,
  });
  revalidatePath("/admin/users");
}

// ---------- Членства (скоуп на достъпа) ----------

export async function addMembershipAction(
  siteId: string,
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const owner = await requireOwner();
  const parsed = membershipSchema.safeParse({
    userId: formData.get("userId"),
    siteId,
    role: formData.get("role") || "VIEWER",
  });
  if (!parsed.success) return { error: "Изберете потребител и роля." };
  const d = parsed.data;
  await prisma.membership.upsert({
    where: { userId_siteId: { userId: d.userId, siteId } },
    create: { userId: d.userId, siteId, role: d.role },
    update: { role: d.role },
  });
  await logAudit(owner, {
    action: "UPDATE",
    entity: "Membership",
    summary: `Достъп до сайт ${siteId} за ${d.userId} (${d.role})`,
  });
  revalidatePath(`/admin/sites/${siteId}`);
  return { ok: "Достъпът е зададен." };
}

export async function removeMembershipAction(
  siteId: string,
  membershipId: string,
): Promise<void> {
  const owner = await requireOwner();
  await prisma.membership.deleteMany({ where: { id: membershipId, siteId } });
  await logAudit(owner, {
    action: "DELETE",
    entity: "Membership",
    entityId: membershipId,
    summary: `Премахнат достъп до сайт ${siteId}`,
  });
  revalidatePath(`/admin/sites/${siteId}`);
}
