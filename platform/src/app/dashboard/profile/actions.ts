"use server";

import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export type ProfileState = { ok?: string; error?: string };

const schema = z.object({
  current: z.string().min(1, "Въведете текущата парола."),
  next: z.string().min(10, "Новата парола трябва да е поне 10 знака.").max(200),
});

export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !(await verifyPassword(parsed.data.current, dbUser.passwordHash))) {
    return { error: "Текущата парола е грешна." };
  }
  const passwordHash = await hashPassword(parsed.data.next);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { ok: "Паролата е сменена успешно." };
}
