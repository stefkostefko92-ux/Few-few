// Проверка на формата „Добавете своя бизнес“ — чист модул (без база), ползва се
// от server action-а. Всичко тук е чужд вход: дължини, позволени знаци и само
// безопасни адреси (http/https), за да не влезе „javascript:“ или друга схема.
import { z } from "zod";
import { BUSINESS_CATEGORY_LABELS } from "@/lib/categories";
import { fieldErrorsOf, type FieldErrors } from "@/lib/form-state";

const CATEGORY_KEYS = Object.keys(BUSINESS_CATEGORY_LABELS);

const FACEBOOK_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i;

/**
 * Връща нормализиран https/http адрес или null. Приема и адрес без схема
 * („www.primer.bg“ → „https://www.primer.bg/“). Отхвърля други схеми, вписани
 * потребител/парола и хостове без точка.
 */
export function safeWebUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
  const out = u.toString();
  return out.length > 300 ? null : out;
}

/** Като safeWebUrl, но само за Facebook (facebook.com, fb.com, fb.me). */
export function safeFacebookUrl(raw: string): string | null {
  const u = safeWebUrl(raw);
  if (!u) return null;
  return FACEBOOK_HOST.test(new URL(u).hostname) ? u : null;
}

// Телефон: цифри, интервали, +, -, (, ), / и поне 6 цифри.
export function isPhone(v: string): boolean {
  return /^[+\d\s()\-/]{6,40}$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 6;
}

const optionalText = (max: number) => z.string().trim().max(max, `Най-много ${max} знака.`).optional().default("");

const phoneField = (msg: string) =>
  optionalText(40).refine((v) => v === "" || isPhone(v), msg);

export const businessSchema = z
  .object({
    // При поправка: slug-ът на съществуващия бизнес (иначе празно).
    za: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9-]*$/, "Невалидна връзка.")
      .optional()
      .default(""),
    name: z
      .string()
      .trim()
      .min(2, "Напишете името на бизнеса.")
      .max(120, "Името е твърде дълго (най-много 120 знака)."),
    category: z
      .string()
      .refine((v) => CATEGORY_KEYS.includes(v), "Изберете вид на бизнеса."),
    description: optionalText(1500),
    address: optionalText(200),
    phone: phoneField("Телефонът на бизнеса изглежда непълен — проверете цифрите."),
    hours: optionalText(200),
    websiteUrl: optionalText(300).refine(
      (v) => v === "" || safeWebUrl(v) !== null,
      "Адресът на сайта не изглежда правилен (напр. www.primer.bg).",
    ),
    facebook: optionalText(300).refine(
      (v) => v === "" || safeFacebookUrl(v) !== null,
      "Връзката към Facebook трябва да е от facebook.com.",
    ),
    note: optionalText(1000),
    contactName: optionalText(80),
    contactPhone: phoneField("Телефонът за връзка изглежда непълен — проверете цифрите."),
    contactEmail: optionalText(160).refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Имейлът за връзка не изглежда правилен.",
    ),
    consent: z.literal("on", {
      errorMap: () => ({ message: "Потвърдете, че имате право да подадете данните на този бизнес." }),
    }),
    // Скрито поле против ботове (honeypot) — човек не го вижда и не го попълва.
    homepage: z.string().max(0).optional().default(""),
  })
  .refine((d) => d.contactPhone !== "" || d.contactEmail !== "", {
    message: "Оставете телефон или имейл, за да се свържем с вас и да проверим данните.",
    path: ["contactPhone"],
  });

export type BusinessInput = z.infer<typeof businessSchema>;

export type BusinessScreen =
  | { status: "honeypot" }
  | { status: "invalid"; error: string; fieldErrors: FieldErrors }
  | { status: "limited" }
  | { status: "ok"; data: BusinessInput };

/**
 * Ред на проверките: 1) honeypot; 2) проверка на данните; 3) едва тогава
 * лимитът (`allow`) — броят се САМО подаванията, които ще се запишат. Иначе
 * човек, който поправя грешките една по една, оставаше блокиран, а зад едно
 * IP (CGNAT) — и съседите му.
 */
export async function screenBusinessSubmission(
  input: { values: Record<string, string>; homepage: string },
  allow: () => boolean | Promise<boolean>,
): Promise<BusinessScreen> {
  if (input.homepage !== "") return { status: "honeypot" };

  const parsed = businessSchema.safeParse({
    ...input.values,
    consent: input.values.consent || undefined,
    homepage: "",
  });
  if (!parsed.success) {
    return {
      status: "invalid",
      error: parsed.error.issues[0]?.message ?? "Невалидни данни.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  if (!(await allow())) return { status: "limited" };
  return { status: "ok", data: parsed.data };
}

// Полетата, които се показват публично в каталога (и могат да се поправят).
export const PUBLIC_FIELDS = [
  ["name", "Име"],
  ["category", "Вид"],
  ["description", "Описание"],
  ["address", "Адрес"],
  ["phone", "Телефон"],
  ["hours", "Работно време"],
  ["websiteUrl", "Уебсайт"],
  ["facebook", "Facebook"],
] as const;

export type PublicField = (typeof PUBLIC_FIELDS)[number][0];

/** Стойностите, които влизат в Business (адресите — нормализирани). */
export function toBusinessData(d: BusinessInput) {
  return {
    name: d.name,
    category: d.category,
    description: d.description,
    address: d.address,
    phone: d.phone,
    hours: d.hours,
    website: d.websiteUrl ? (safeWebUrl(d.websiteUrl) ?? "") : "",
    facebook: d.facebook ? (safeFacebookUrl(d.facebook) ?? "") : "",
  };
}

type BusinessRow = {
  name: string;
  category: string;
  description: string;
  address: string;
  phone: string;
  hours: string;
  website: string;
  facebook: string;
};

/**
 * Полетата, които поправката наистина променя: [поле, етикет, преди, след].
 * И двете страни се сравняват нормализирани — адресът от каталога
 * („https://dsk.bg“) и същият адрес от формата (safeWebUrl → „https://dsk.bg/“)
 * не са промяна; иначе всяко празно изпращане минава като поправка.
 */
export function businessChanges(
  existing: BusinessRow,
  next: BusinessRow,
): { key: PublicField; label: string; before: string; after: string }[] {
  const norm = (v: string, fix: (raw: string) => string | null) => (v ? (fix(v) ?? v) : "");
  const before: Record<PublicField, string> = {
    name: existing.name,
    category: existing.category,
    description: existing.description,
    address: existing.address,
    phone: existing.phone,
    hours: existing.hours,
    websiteUrl: norm(existing.website, safeWebUrl),
    facebook: norm(existing.facebook, safeFacebookUrl),
  };
  const after: Record<PublicField, string> = {
    name: next.name,
    category: next.category,
    description: next.description,
    address: next.address,
    phone: next.phone,
    hours: next.hours,
    websiteUrl: next.website,
    facebook: next.facebook,
  };
  return PUBLIC_FIELDS.filter(([key]) => (before[key] ?? "").trim() !== (after[key] ?? "").trim()).map(
    ([key, label]) => ({ key, label, before: before[key], after: after[key] }),
  );
}
