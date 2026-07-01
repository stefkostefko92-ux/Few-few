"use server";

import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mailer";
import { z } from "zod";

export type ForgotState = { ok?: boolean; error?: string };

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Винаги връща успех (без разкриване дали имейлът съществува). Праща линк само
// ако акаунтът е реален и активен и SMTP е конфигуриран.
export async function forgotAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  if (!rateLimit(`forgot:${ip}`, 5, 10 * 60_000)) {
    return { error: "Твърде много опити. Опитайте по-късно." };
  }
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Въведете валиден имейл." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.active) {
    const token = randomBytes(32).toString("hex");
    const exp = new Date(Date.now() + 60 * 60_000); // 1 час
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExp: exp },
    });
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";
    await sendMail({
      to: user.email,
      subject: "Възстановяване на парола — Платформа",
      text:
        `Здравейте,\n\nЗаявено е възстановяване на паролата ви.\n` +
        `Отворете този линк (валиден 1 час):\n${base}/reset?token=${token}\n\n` +
        `Ако не сте вие — игнорирайте това писмо.`,
    });
  }
  return { ok: true };
}
