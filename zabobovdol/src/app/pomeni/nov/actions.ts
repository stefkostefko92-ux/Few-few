"use server";

import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import {
  FORM_FIELDS,
  friendlyPhone,
  kindInfo,
  moderationMail,
  obituarySlugBase,
  obituarySubmissionSchema,
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

  // Близките подават по една-две обяви; по-строг лимит от останалите форми
  // (прозорецът е най-дългият позволен — MAX_WINDOW_MS, 15 мин.).
  if (!rateLimit(await clientKey("pomen"), 3, 15 * 60 * 1000)) {
    return { ok: false, error: RATE_LIMIT_MESSAGE, values, attempt };
  }

  const parsed = obituarySubmissionSchema().safeParse({
    ...values,
    website: str(formData.get("website")),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    const field = FORM_FIELDS.find((f) => f === path);
    return {
      ok: false,
      error: issue?.message ?? "Невалидни данни.",
      field,
      values,
      attempt,
    };
  }
  const d = parsed.data;

  try {
    const base = obituarySlugBase(d.fullName, d.deathDate);
    const slug = uniqueSlug(base, await takenObituarySlugs(base));

    const created = await prisma.obituary.create({
      data: {
        slug,
        kind: d.kind,
        fullName: d.fullName,
        birthYear: d.birthYear,
        deathDate: d.deathDate,
        ceremonyAt: d.ceremonyAt,
        ceremonyPlace: d.ceremonyPlace,
        text: d.text,
        fromFamily: d.fromFamily,
        // Снимка не се приема от формата — добавя я редакторът след проверка.
        photoUrl: "",
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        consent: true,
        published: false,
      },
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
