"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  name: z.string().trim().min(2, "Въведете име."),
  role: z.enum(["ADMIN", "EDITOR"]),
  password: z.string().min(8, "Паролата трябва да е поне 8 знака."),
});

export async function createUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/admin/users?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const data = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) {
    redirect("/admin/users?error=" + encodeURIComponent("Вече има потребител с този имейл."));
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      passwordHash: await hashPassword(data.password),
    },
  });
  await logAudit(admin, {
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    summary: `Нов потребител: ${data.email} (${data.role})`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function updateUser(userId: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "EDITOR") === "ADMIN" ? "ADMIN" : "EDITOR";
  const active = formData.get("active") === "on";
  const newPassword = String(formData.get("password") ?? "");

  // Не позволявай да остане системата без активен администратор.
  if (role !== "ADMIN" || !active) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (target?.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: userId } },
      });
      if (otherAdmins === 0) {
        redirect(
          "/admin/users?error=" +
            encodeURIComponent("Трябва да остане поне един активен администратор."),
        );
      }
    }
  }

  const data: Record<string, unknown> = { name: name || undefined, role, active };
  if (newPassword) {
    if (newPassword.length < 8) {
      redirect("/admin/users/" + userId + "?error=" + encodeURIComponent("Паролата е твърде кратка."));
    }
    data.passwordHash = await hashPassword(newPassword);
  }

  await prisma.user.update({ where: { id: userId }, data });
  await logAudit(admin, {
    action: "UPDATE",
    entity: "User",
    entityId: userId,
    summary: `Промяна на потребител (${role}${newPassword ? ", нова парола" : ""})`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function deleteUser(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.id === userId) {
    redirect("/admin/users?error=" + encodeURIComponent("Не можете да изтриете себе си."));
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (target?.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true, id: { not: userId } },
    });
    if (otherAdmins === 0) {
      redirect(
        "/admin/users?error=" +
          encodeURIComponent("Трябва да остане поне един активен администратор."),
      );
    }
  }
  await prisma.user.delete({ where: { id: userId } });
  await logAudit(admin, {
    action: "DELETE",
    entity: "User",
    entityId: userId,
    summary: `Изтрит потребител: ${target?.email ?? userId}`,
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?deleted=1");
}
