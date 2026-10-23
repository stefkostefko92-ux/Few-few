"use server";

import { Prisma, type BusinessCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { rateLimit, clientKey, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { businessSchema, PUBLIC_FIELDS, toBusinessData, type BusinessInput } from "./schema";

export type BusinessFormValues = Record<string, string>;

export type BusinessFormState = {
  ok: boolean;
  mode?: "new" | "fix";
  error?: string;
  /** Въведеното до момента — за да не се губи при грешка. */
  values?: BusinessFormValues;
  /** Брояч на опитите — сменя ключа на формата, за да покаже `values`. */
  attempt?: number;
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
    const slug = uniqueSlug(slugify(d.name), new Set(taken.map((t) => t.slug)));
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

  const next = toBusinessData(d);
  const before: Record<string, string> = {
    name: existing.name,
    category: existing.category,
    description: existing.description,
    address: existing.address,
    phone: existing.phone,
    hours: existing.hours,
    websiteUrl: existing.website,
    facebook: existing.facebook,
  };
  const after: Record<string, string> = {
    name: next.name,
    category: next.category,
    description: next.description,
    address: next.address,
    phone: next.phone,
    hours: next.hours,
    websiteUrl: next.website,
    facebook: next.facebook,
  };

  const changes = PUBLIC_FIELDS.filter(([key]) => (before[key] ?? "").trim() !== (after[key] ?? "").trim()).map(
    ([key, label]) => `${label}: „${shown(key, before[key])}“ → „${shown(key, after[key])}“`,
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

  if (!rateLimit(await clientKey("biznes"))) return fail(RATE_LIMIT_MESSAGE);

  const parsed = businessSchema.safeParse({
    ...values,
    consent: values.consent || undefined,
    homepage: str(formData.get("homepage")),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Невалидни данни.");
  }
  const d = parsed.data;

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
