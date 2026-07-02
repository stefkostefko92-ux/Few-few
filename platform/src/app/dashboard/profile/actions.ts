"use server";

import { requireUser, hashPassword, verifyPassword, createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { generateTotpSecret, verifyTotp, otpauthUri } from "@/lib/totp";
import { z } from "zod";

export type ProfileState = { ok?: string; error?: string };
export type TwoFAStart = { secret?: string; uri?: string; error?: string };

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
  // Смяната инвалидира всички сесии (нова „версия на паролата" в JWT) —
  // преиздаваме текущата, за да остане потребителят логнат само тук.
  await createSession(user);
  return { ok: "Паролата е сменена успешно. Другите ви сесии са прекратени." };
}

// Започва настройка на 2FA: генерира тайна, пази я криптирана (изключена още),
// връща тайната + otpauth URI за добавяне в приложение (Google Authenticator).
export async function begin2faAction(): Promise<TwoFAStart> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpEnabled: false },
  });
  return { secret, uri: otpauthUri(secret, user.email) };
}

// Потвърждава и включва 2FA с код от приложението.
export async function enable2faAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.totpSecret) return { error: "Първо стартирайте настройката." };
  const secret = decryptSecret(dbUser.totpSecret);
  if (!verifyTotp(secret, code, Date.now())) return { error: "Невалиден код. Опитайте отново." };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  return { ok: "Двуфакторната автентикация е включена." };
}

// Изключва 2FA (изисква текущата парола).
export async function disable2faAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !(await verifyPassword(password, dbUser.passwordHash))) {
    return { error: "Грешна парола." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null },
  });
  return { ok: "Двуфакторната автентикация е изключена." };
}
