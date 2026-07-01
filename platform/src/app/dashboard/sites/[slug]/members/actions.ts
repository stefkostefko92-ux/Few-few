"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mailer";
import { z } from "zod";

export type MemberState = { ok?: string; error?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  role: z.enum(["MANAGER", "VIEWER"]),
});

// Кани член: ако имейлът вече е регистриран → членство веднага; иначе покана,
// която се прилага при регистрация с този имейл.
export async function inviteMemberAction(
  slug: string,
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };
  const { email, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

  if (existing) {
    await prisma.membership.upsert({
      where: { userId_siteId: { userId: existing.id, siteId: found.site.id } },
      create: { userId: existing.id, siteId: found.site.id, role },
      update: { role },
    });
    await sendMail({
      to: email,
      subject: `Достъп до „${found.site.name}"`,
      text: `Получихте достъп (${role === "MANAGER" ? "мениджър" : "наблюдател"}) до сайта „${found.site.name}".\nВлезте: ${base}/login`,
    });
    await logAudit(user, { action: "CREATE", entity: "Membership", summary: `Достъп за ${email} до ${found.site.name}` });
    revalidatePath(`/dashboard/sites/${slug}/members`);
    return { ok: `${email} вече има достъп.` };
  }

  // Непознат имейл → покана (7 дни).
  const token = randomBytes(24).toString("hex");
  await prisma.invite.create({
    data: {
      siteId: found.site.id,
      email,
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  });
  await sendMail({
    to: email,
    subject: `Покана за „${found.site.name}"`,
    text:
      `Поканени сте да управлявате сайта „${found.site.name}".\n` +
      `Създайте акаунт с този имейл (${email}) и достъпът се активира автоматично:\n${base}/register`,
  });
  revalidatePath(`/dashboard/sites/${slug}/members`);
  return { ok: `Изпратена е покана до ${email}.` };
}

export async function changeMemberRoleAction(
  slug: string,
  userId: string,
  role: string,
): Promise<void> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return;
  const r = role === "MANAGER" ? "MANAGER" : "VIEWER";
  await prisma.membership.updateMany({
    where: { siteId: found.site.id, userId },
    data: { role: r },
  });
  revalidatePath(`/dashboard/sites/${slug}/members`);
}

export async function removeMemberAction(slug: string, userId: string): Promise<MemberState> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  await prisma.membership.deleteMany({ where: { siteId: found.site.id, userId } });
  revalidatePath(`/dashboard/sites/${slug}/members`);
  return { ok: "Премахнат." };
}

export async function cancelInviteAction(slug: string, inviteId: string): Promise<MemberState> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  await prisma.invite.deleteMany({ where: { id: inviteId, siteId: found.site.id } });
  revalidatePath(`/dashboard/sites/${slug}/members`);
  return { ok: "Отменена." };
}
