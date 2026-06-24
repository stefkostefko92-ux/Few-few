"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { error: "Въведете имейл и парола." };
  }

  // Защита от brute-force: най-много 8 опита на 15 минути от един IP.
  if (!rateLimit(await clientKey("login"), 8, 15 * 60 * 1000)) {
    return {
      error:
        "Твърде много опити за вход. Изчакайте около 15 минути и опитайте отново.",
    };
  }

  const user = await authenticate(email, password);
  if (!user) {
    // Лек запис за откриване на атаки (без да издаваме дали имейлът съществува).
    await logAudit(null, {
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Неуспешен опит за вход: ${email.trim().toLowerCase().slice(0, 80)}`,
    });
    return { error: "Грешен имейл или парола." };
  }
  await createSession(user);
  await logAudit(user, {
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `Вход в администрацията: ${user.email}`,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
