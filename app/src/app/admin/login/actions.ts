"use server";

import { redirect } from "next/navigation";
import { checkCredentials, createSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { field, type FormState } from "@/lib/forms";

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email", 160);
  const password = field(formData, "password", 200);

  if (!checkCredentials(email, password)) {
    return { ok: false, message: "Грешен имейл или парола." };
  }

  await createSessionCookie(email);
  await audit({
    userEmail: email,
    action: "LOGIN",
    entity: "User",
    summary: "Вход в администрацията",
  });
  redirect("/admin");
}
