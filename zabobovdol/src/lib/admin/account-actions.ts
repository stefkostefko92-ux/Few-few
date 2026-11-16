"use server";

import { redirect } from "next/navigation";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { failState, nextAttempt, type FormState } from "@/lib/form-state";
import { ACCOUNT_ERRORS, parseAccountForm } from "@/lib/account-core";

// „Моят профил“: всеки влязъл сменя СВОЯ имейл и/или парола със сегашната
// парола. Нова парола → нов печат на сесията → всички други сесии падат; този
// браузър получава нова сесия и остава влязъл. Паролите не се връщат във
// формата и не влизат в одита.

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function updateOwnAccount(prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const attempt = nextAttempt(prev);
  const values = { email: str(fd, "email").slice(0, 300) };

  if (!rateLimit(`account:${me.id}`, 10, 10 * 60 * 1000))
    return failState(values, attempt, "Твърде много опити. Изчакайте няколко минути.");

  const parsed = parseAccountForm(
    {
      email: values.email,
      currentPassword: str(fd, "currentPassword"),
      newPassword: str(fd, "newPassword"),
      newPassword2: str(fd, "newPassword2"),
    },
    { email: me.email },
  );
  if (!parsed.ok) return failState(values, attempt, parsed.errors._, parsed.errors);

  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(str(fd, "currentPassword"), row.passwordHash)))
    return failState(values, attempt, undefined, { currentPassword: ACCOUNT_ERRORS.currentPasswordWrong });

  if (parsed.emailChanged) {
    const taken = await prisma.user.findUnique({ where: { email: parsed.email }, select: { id: true } });
    if (taken && taken.id !== me.id) return failState(values, attempt, undefined, { email: ACCOUNT_ERRORS.emailTaken });
  }

  try {
    await prisma.user.update({
      where: { id: me.id },
      data: {
        ...(parsed.emailChanged ? { email: parsed.email } : {}),
        ...(parsed.newPassword ? { passwordHash: await hashPassword(parsed.newPassword) } : {}),
      },
    });
  } catch {
    // Състезание за същия имейл (уникален ключ) — казваме го, не гърмим.
    return failState(values, attempt, undefined, { email: ACCOUNT_ERRORS.emailTaken });
  }

  // Нова сесия с новия печат: старите (други устройства) вече не важат.
  await createSession({ ...me, email: parsed.email });

  const what = [parsed.emailChanged ? `имейл ${me.email} → ${parsed.email}` : "", parsed.newPassword ? "парола" : ""]
    .filter(Boolean)
    .join(" и ");
  await logAudit({ id: me.id, email: parsed.email }, {
    action: "UPDATE",
    entity: "User",
    entityId: me.id,
    summary: `Смяна в „Моят профил“: ${what}${parsed.newPassword ? " (другите сесии са прекратени)" : ""}`,
  });

  redirect(`/admin/profil?saved=${parsed.newPassword ? "pw" : "1"}`);
}
