"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";
import { failState, nextAttempt, readValues, type FormState } from "@/lib/form-state";
import { authSecret, clearMailConfigCache, getMailConfig, mailStatus } from "@/lib/mail-config";
import { errorCodeOf, parseMailForm, sealSmtpKey } from "@/lib/mail-config-core";
import { createSmtpTransport } from "@/lib/mail";

// Пощата на сайта (Brevo SMTP) от /admin/poshta — само ADMIN. По образеца на
// rilievi (#32): записът иска паролата на акаунта (оттук тръгват всички писма
// на сайта — сигналите до общината, известията), ключът само се пише, пробното
// писмо отива до самия администратор и казва само кода на грешката.

/** Полетата, които се връщат във формата при грешка — БЕЗ ключа и паролата. */
const ECHO = ["host", "port", "user", "fromName", "fromEmail"] as const;

export async function saveMailSettings(prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const attempt = nextAttempt(prev);
  const values = readValues(fd, ECHO);

  if (!rateLimit(`mailcfg:${admin.id}`, 10, 10 * 60 * 1000))
    return failState(values, attempt, "Твърде много опити. Изчакайте няколко минути.");

  const status = await mailStatus();
  const parsed = parseMailForm(
    { ...values, key: typeof fd.get("key") === "string" ? (fd.get("key") as string) : "" },
    {
      production: process.env.NODE_ENV === "production",
      keySaved: status.keySaved,
      saved: status.saved ? { host: status.saved.host, user: status.saved.user } : null,
    },
  );

  const accountPassword = typeof fd.get("accountPassword") === "string" ? (fd.get("accountPassword") as string) : "";
  const row = await prisma.user.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
  const passwordOk = Boolean(accountPassword && row && (await verifyPassword(accountPassword, row.passwordHash)));

  if (!parsed.ok || !passwordOk) {
    return failState(values, attempt, undefined, {
      ...(parsed.ok ? {} : parsed.errors),
      ...(passwordOk ? {} : { accountPassword: "Паролата за вход в панела не е вярна." }),
    });
  }

  const v = parsed.values;
  let keyEnc: string | null = null;
  if (v.key !== null) {
    try {
      keyEnc = sealSmtpKey(authSecret(), v.key);
    } catch {
      return failState(values, attempt, "Сървърът няма AUTH_SECRET — ключът не може да се запише сигурно.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const put = (key: string, value: string) =>
      tx.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    await put(SETTING_KEYS.mailHost, v.host);
    await put(SETTING_KEYS.mailPort, String(v.port));
    await put(SETTING_KEYS.mailUser, v.user);
    if (keyEnc) await put(SETTING_KEYS.mailKeyEnc, keyEnc);
    await put(SETTING_KEYS.mailFromName, v.fromName);
    await put(SETTING_KEYS.mailFromEmail, v.fromEmail);
    await put(SETTING_KEYS.mailEnabled, "1");
    await put(SETTING_KEYS.mailUpdatedBy, admin.email);
    await put(SETTING_KEYS.mailUpdatedAt, new Date().toISOString());
  });
  clearMailConfigCache();

  // Без ключа и без логина.
  await logAudit(admin, {
    action: "UPDATE",
    entity: "MailSettings",
    summary: `Пощата (SMTP) от панела: ${v.host}:${v.port}, подател ${v.fromEmail}${keyEnc ? ", нов ключ" : ""}`,
  });

  revalidatePath("/admin/poshta");
  redirect("/admin/poshta?saved=1");
}

/** Изключва настройката от панела (остава записана) — писмата пак тръгват от .env, ако го има. */
export async function disableMailSettings(): Promise<void> {
  const admin = await requireAdmin();
  await setSetting(SETTING_KEYS.mailEnabled, "0");
  await setSetting(SETTING_KEYS.mailUpdatedBy, admin.email);
  await setSetting(SETTING_KEYS.mailUpdatedAt, new Date().toISOString());
  clearMailConfigCache();
  await logAudit(admin, { action: "UPDATE", entity: "MailSettings", summary: "Пощата от панела е изключена" });
  revalidatePath("/admin/poshta");
  redirect("/admin/poshta?off=1");
}

/** Пробно писмо до самия администратор: вход в сървъра (verify) + писмо. */
export async function sendTestMail(): Promise<void> {
  const admin = await requireAdmin();
  if (!rateLimit(`mailtest:${admin.id}`, 5, 10 * 60 * 1000)) redirect("/admin/poshta?test=limit");

  const { params } = await getMailConfig();
  let result: { ok: true } | { ok: false; code: string } | null = null;
  if (params) {
    const t = createSmtpTransport(params);
    try {
      await t.verify();
      await t.sendMail({
        from: params.from,
        to: admin.email,
        subject: "Пробно писмо от „За Бобов дол“",
        text:
          "Здравейте,\n\nТова е пробно писмо от админ панела на „За Бобов дол“ " +
          `(${params.source === "панел" ? "настройката от панела" : "настройката от .env"}).\n` +
          "Щом го виждате, пощата на сайта работи.\n",
      });
      result = { ok: true };
    } catch (err) {
      result = { ok: false, code: errorCodeOf(err) };
    } finally {
      t.close();
    }
  }

  await logAudit(admin, {
    action: "UPDATE",
    entity: "MailTest",
    summary: !result ? "Пробно писмо: няма поща" : result.ok ? "Пробно писмо: изпратено" : `Пробно писмо: грешка ${result.code}`,
  });

  if (!result) redirect("/admin/poshta?test=off");
  if (result.ok) redirect("/admin/poshta?test=ok");
  redirect(`/admin/poshta?test=err&code=${encodeURIComponent(result.code)}`);
}
