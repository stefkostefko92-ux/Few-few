"use server";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import {
  FORM_FIELDS,
  friendlyPhone,
  kindInfo,
  moderationMail,
  obituaryCreateData,
  obituarySlug,
  obituarySlugBase,
  screenObituarySubmission,
  type FormField,
} from "@/lib/obituary";
import { purgeExpiredObituaryContacts, takenObituarySlugs } from "@/lib/obituary-store";

export type ObituaryFormState = {
  ok: boolean;
  error?: string;
  /** Кое поле е сгрешено — за фокус и aria-invalid. */
  field?: FormField;
  /** Въведеното се връща, за да не пишат близките всичко отначало. */
  values?: Partial<Record<FormField, string>>;
  /** Брои опитите — формата се пресъздава с върнатите стойности. */
  attempt?: number;
};

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

export async function submitObituary(
  prev: ObituaryFormState,
  formData: FormData,
): Promise<ObituaryFormState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const values: Partial<Record<FormField, string>> = {};
  for (const f of FORM_FIELDS) values[f] = str(formData.get(f)).slice(0, 2100);

  // Ред: honeypot → проверка на данните → лимит (броят се САМО подаванията,
  // които ще се запишат — виж screenObituarySubmission). Близките подават по
  // една-две обяви; по-строг лимит от останалите форми (прозорецът е
  // най-дългият позволен — MAX_WINDOW_MS, 15 мин.).
  const screen = await screenObituarySubmission(
    { values, website: str(formData.get("website")) },
    async () => rateLimit(await clientKey("pomen"), 3, 15 * 60 * 1000),
  );
  if (screen.status === "honeypot") {
    return { ok: false, error: "Невалидни данни.", values, attempt };
  }
  if (screen.status === "invalid") {
    return { ok: false, error: screen.error, field: screen.field, values, attempt };
  }
  if (screen.status === "limited") {
    return { ok: false, error: RATE_LIMIT_MESSAGE, values, attempt };
  }
  const d = screen.data;

  try {
    const base = obituarySlugBase(d.fullName, d.deathDate);
    const slug = obituarySlug(base, await takenObituarySlugs(base));

    const created = await prisma.obituary.create({
      data: obituaryCreateData(d, slug),
      select: { id: true },
    });

    // В одита и в писмото — без имена и телефони (минимизация).
    await logAudit(null, {
      action: "CREATE",
      entity: "Obituary",
      entityId: created.id,
      summary: `Нов ${kindInfo(d.kind).label.toLowerCase()} през сайта — чака одобрение`,
    });

    const mail = moderationMail(d.kind, SITE.url);
    await sendMail({ to: SITE.contact.email, subject: mail.subject, text: mail.text });

    await purgeExpiredObituaryContacts();
  } catch (err) {
    console.error("Записът на некролог/помен не успя:", err);
    return {
      ok: false,
      error: `Нещо се обърка и обявата не е записана. Опитайте отново или ни се обадете на ${friendlyPhone(SITE.contact.phone)}.`,
      values,
      attempt,
    };
  }

  return { ok: true, attempt };
}
