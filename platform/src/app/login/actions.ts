"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { loginSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export type LoginState = { error?: string; need2fa?: boolean };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Въведете валиден имейл и парола." };
  }

  // Лимит по IP: 8 опита на 5 минути.
  const hdrs = await headers();
  // Последната стойност е добавената от доверения reverse proxy; първата е
  // клиентски-контролируема → взимаме последната срещу spoof.
  const ip = hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  if (!rateLimit(`login:${ip}`, 8, 5 * 60_000)) {
    return { error: "Твърде много опити. Опитайте отново след няколко минути." };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Постоянно време по-нататък: винаги проверяваме хеш (или изхабяваме време).
  const ok =
    user && user.active
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, "$2a$11$" + "x".repeat(53));

  if (!user || !user.active || !ok) {
    await logAudit(null, {
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Неуспешен вход за ${email}`,
    });
    return { error: "Грешен имейл или парола." };
  }

  // Втори фактор (ако е включен): изисква валиден TOTP код.
  if (user.totpEnabled && user.totpSecret) {
    const code = String(formData.get("code") ?? "").trim();
    if (!code) return { need2fa: true };
    if (!verifyTotp(decryptSecret(user.totpSecret), code, Date.now())) {
      return { error: "Невалиден код за потвърждение.", need2fa: true };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await logAudit(user, {
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `Вход: ${user.email}`,
  });

  redirect("/dashboard");
}
