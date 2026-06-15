"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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
  const user = await authenticate(email, password);
  if (!user) {
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
