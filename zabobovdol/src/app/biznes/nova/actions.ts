"use server";

import { Prisma, type BusinessCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessSlug } from "@/lib/business-form";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import type { FormState } from "@/lib/form-state";
import { businessChanges, screenBusinessSubmission, toBusinessData, type BusinessInput } from "./schema";

export type BusinessFormValues = Record<string, string>;

export type BusinessFormState = FormState & {
  mode?: "new" | "fix";
};

const TEXT_FIELDS = [
  "za",
  "name",
  "category",
  "description",
  "address",
  "phone",
  "hours",
  "websiteUrl",
  "facebook",
  "note",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

const GENERIC_ERROR = "Възникна грешка при записа. Опитайте отново след малко.";

function categoryLabel(v: string): string {
  return labelFor(BUSINESS_CATEGORY_LABELS, v);
}

function shown(field: string, v: string): string {
  if (!v) return "—";
  return field === "category" ? categoryLabel(v) : v;
}

// Известие до екипа БЕЗ лични данни — само името на бизнеса и връзка към
// админ панела. Данните за връзка с подателя стоят в „Контактни съобщения“
// (достъп само за администратор).
async function notifyTeam(subject: string, adminPath: string): Promise<void> {
  try {
    await sendMail({
      to: SITE.contact.email,
      subject,
      text: [
        subject,
        "",
        `Преглед: ${SITE.url}${adminPath}`,
        `Данните за връзка с подателя са в админ панела → „Контактни съобщения“.`,
      ].join("\n"),
    });
  } catch {
    /* без SMTP подаването пак е записано в админ панела */
  }
}

async function createNew(d: BusinessInput): Promise<string> {
  const data = toBusinessData(d);
  // Две опитвания: ако двама подадат едно и също име едновременно, вторият
  // получава следващия свободен адрес.
  for (let attempt = 0; attempt < 2; attempt++) {
    const taken = await prisma.business.findMany({ select: { slug: true } });
    // „nova“ и другите статични пътища под /biznes/ са запазени.
    const slug = businessSlug(d.name, taken.map((t) => t.slug));
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.business.create({
          data: {
            ...data,
            category: data.category as BusinessCategory,
            slug,
            published: false, // чака проверка от екипа
          },
        });
        await tx.contactMessage.create({
          data: {
            name: d.contactName,
            phone: d.contactPhone,
            email: d.contactEmail,
            subject: `Нов бизнес за проверка: ${d.name}`,
            message: [
              "Подаден е нов бизнес през формата „Добавете своя бизнес“. Чака проверка.",
              "",
              `Бизнес: „${d.name}“ (${categoryLabel(d.category)})`,
              `Преглед и публикуване: ${SITE.url}/admin/business/${created.id}`,
              "",
              "Преди публикуване: свържете се с подателя, сверете данните и отметнете „Публикувано“.",
              d.note ? `\nБележка от подателя:\n${d.note}` : "",
            ]
              .filter((l) => l !== "")
              .join("\n"),
          },
        });
        return created.id;
      });
    } catch (err) {
      const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!duplicate || attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

async function createFix(
  d: BusinessInput,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const existing = await prisma.business.findFirst({
    where: { slug: d.za, published: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      address: true,
      phone: true,
      hours: true,
      website: true,
      facebook: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "Не намерихме този бизнес в каталога. Подайте го като нов." };
  }

  const changes = businessChanges(existing, toBusinessData(d)).map(
    ({ key, label, before, after }) => `${label}: „${shown(key, before)}“ → „${shown(key, after)}“`,
  );
  if (changes.length === 0 && !d.note) {
    return {
      ok: false,
      error: "Не сте променили нищо. Поправете данните във формата или опишете какво да променим в бележката.",
    };
  }

  const msg = await prisma.contactMessage.create({
    data: {
      name: d.contactName,
      phone: d.contactPhone,
      email: d.contactEmail,
      subject: `Поправка за бизнес: ${existing.name}`,
      message: [
        `Предложена поправка за „${existing.name}“. Чака проверка — нищо не е променено автоматично.`,
        "",
        ...(changes.length ? ["Промени:", ...changes] : ["Без промени в полетата."]),
        d.note ? `\nБележка от подателя:\n${d.note}` : "",
        "",
        `Редакция: ${SITE.url}/admin/business/${existing.id}`,
      ]
        .filter((l) => l !== "")
        .join("\n"),
    },
  });
  return { ok: true, id: msg.id, name: existing.name };
}

export async function submitBusiness(
  prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const values: BusinessFormValues = {};
  for (const f of TEXT_FIELDS) values[f] = str(formData.get(f));
  values.consent = str(formData.get("consent"));
  const attempt = (prev.attempt ?? 0) + 1;
  const mode = values.za ? "fix" : "new";
  const fail = (error: string): BusinessFormState => ({ ok: false, mode, error, values, attempt });

  // Ред: honeypot → проверка на данните → лимит (броят се само подаванията,
  // които ще се запишат — виж screenBusinessSubmission).
  const screen = await screenBusinessSubmission(
    { values, homepage: str(formData.get("homepage")) },
    async () => rateLimit(await clientKey("biznes")),
  );
  if (screen.status === "honeypot") return fail("Невалидни данни.");
  // Грешките по поле — под всяко поле и в обобщението най-горе.
  if (screen.status === "invalid") {
    return { ok: false, mode, values, attempt, fieldErrors: screen.fieldErrors };
  }
  if (screen.status === "limited") return fail(RATE_LIMIT_MESSAGE);
  const d = screen.data;

  try {
    if (d.za) {
      const res = await createFix(d);
      if (!res.ok) return fail(res.error);
      await logAudit(null, {
        action: "CREATE",
        entity: "ContactMessage",
        entityId: res.id,
        summary: `Предложена поправка за бизнес „${res.name}“ (чака проверка)`,
      });
      await notifyTeam(`Поправка за бизнес чака проверка: ${res.name}`, "/admin/saobshteniya");
      return { ok: true, mode: "fix", attempt };
    }

    const id = await createNew(d);
    await logAudit(null, {
      action: "CREATE",
      entity: "Business",
      entityId: id,
      summary: `Нов бизнес от посетител: „${d.name}“ (чака проверка)`,
    });
    await notifyTeam(`Нов бизнес чака проверка: ${d.name}`, `/admin/business/${id}`);
    return { ok: true, mode: "new", attempt };
  } catch (err) {
    console.error("Грешка при запис на бизнес:", err instanceof Error ? err.message : "неизвестна");
    return fail(GENERIC_ERROR);
  }
}
