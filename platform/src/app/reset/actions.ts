"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

export type ResetState = { error?: string };

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10, "Паролата трябва да е поне 10 знака.").max(200),
});

export async function resetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };

  const user = await prisma.user.findFirst({
    where: { resetToken: parsed.data.token, resetTokenExp: { gt: new Date() } },
    select: { id: true },
  });
  if (!user) return { error: "Линкът е невалиден или изтекъл. Заявете нов." };

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExp: null },
  });
  redirect("/login?reset=1");
}
