// Некролози и помени — чистата логика (без база и без "server-only", за да се
// тества с node:test). Базата е в ./obituary-store.ts, страниците — в
// src/app/pomeni/**.
//
// Дати: сайтът пази часовете като „стенно време“, записано в UTC (сървърът е
// TZ=UTC, а админ панелът показва `toISOString()`). Затова тук парсваме и
// форматираме изрично в UTC — каквото близките напишат („11:00“), същото вижда
// и редакторът в админа, и посетителят на страницата.

import { z } from "zod";
import { slugify } from "@/lib/slug";

export const OBITUARY_KINDS = ["NECROLOGY", "MEMORIAL"] as const;
export type ObituaryKind = (typeof OBITUARY_KINDS)[number];

type KindInfo = {
  /** Кратко име на вида — за списъци и съобщения. */
  label: string;
  plural: string;
  /** Традиционното заглавие над обявата. */
  heading: string;
  /** Как се казва събитието — „Погребение“ или „Помен“. */
  ceremony: string;
  /** Стойност на ?vid= във филтъра на /pomeni. */
  filter: string;
};

export const KIND_INFO: Record<ObituaryKind, KindInfo> = {
  NECROLOGY: {
    label: "Некролог",
    plural: "Некролози",
    heading: "Тъжна вест",
    ceremony: "Погребение",
    filter: "nekrolozi",
  },
  MEMORIAL: {
    label: "Помен",
    plural: "Помени",
    heading: "Възпоменание",
    ceremony: "Помен",
    filter: "pomeni",
  },
};

export function isObituaryKind(v: unknown): v is ObituaryKind {
  return typeof v === "string" && (OBITUARY_KINDS as readonly string[]).includes(v);
}

/** Непознат вид (стар запис, ръчна редакция) се показва като некролог. */
export function kindInfo(kind: string): KindInfo {
  return isObituaryKind(kind) ? KIND_INFO[kind] : KIND_INFO.NECROLOGY;
}

/** ?vid=nekrolozi|pomeni → вид; всичко друго → без филтър. */
export function parseKindFilter(v: unknown): ObituaryKind | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  for (const k of OBITUARY_KINDS) if (KIND_INFO[k].filter === s) return k;
  return null;
}

export const PAGE_SIZE = 24;

/** ?str=2 → 2; липсващо, невалидно или прекалено голямо → 1. */
export function parsePage(v: unknown): number {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string" || !/^\d{1,4}$/.test(s)) return 1;
  const n = Number(s);
  return n >= 1 && n <= 1000 ? n : 1;
}

// --- Дати („стенно време“ в UTC) ---

const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];
const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];
const DAY_MS = 24 * 60 * 60 * 1000;

/** „2026-10-24“ (поле type="date") → полунощ UTC на тази дата; иначе null. */
export function parseDateInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null; // напр. 31 февруари
  }
  return dt;
}

/** „11:00“ (поле type="time") → минути от полунощ; иначе null. */
export function parseTimeInput(v: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Дата + час, написани от близките, като „стенно време“ в UTC. */
export function combineDateTime(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** „24 октомври 2026 г.“ */
export function formatDateBg(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} г.`;
}

/** „събота, 24 октомври 2026 г., 11:00 ч.“ */
export function formatDateTimeBg(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]}, ${formatDateBg(d)}, ${hh}:${mm} ч.`;
}

/** Днешната дата в София като полунощ UTC (за сравнение със „стенно време“). */
export function sofiaTodayUtc(now: Date = new Date()): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const d = parseDateInput(ymd);
  return d ? d.getTime() : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function wallDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** „Днес“ / „Утре“ за погребение или помен; иначе null. */
export function relativeDayLabel(at: Date | null, now: Date = new Date()): string | null {
  if (!at) return null;
  const diff = Math.round((wallDayUtc(at) - sofiaTodayUtc(now)) / DAY_MS);
  if (diff === 0) return "Днес";
  if (diff === 1) return "Утре";
  return null;
}

/** „1945 – 2026“; само раждане → „р. 1945“; без години → "". */
export function yearsLabel(birthYear: number | null, deathDate: Date | null): string {
  const dy = deathDate ? deathDate.getUTCFullYear() : null;
  if (birthYear && dy) return `${birthYear} – ${dy}`;
  if (birthYear) return `р. ${birthYear}`;
  return "";
}

/** „Погребение: събота, 24 октомври 2026 г., 11:00 ч., църквата …“ */
export function ceremonyLine(kind: string, at: Date | null, place: string): string {
  if (!at && !place) return "";
  const parts = [at ? formatDateTimeBg(at) : "", place.trim()].filter(Boolean);
  return `${kindInfo(kind).ceremony}: ${parts.join(", ")}`;
}

/** Снимката се слага само от админа; пускаме само наши качени файлове и https. */
export function safePhotoUrl(u: string | null | undefined): string {
  const s = (u ?? "").trim();
  if (/^\/api\/foto\/[A-Za-z0-9._-]+$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return "";
}

/** „+359877414874“ → „0877 414 874“ (по-лесно за четене); иначе както е. */
export function friendlyPhone(p: string): string {
  const m = /^\+359(\d{3})(\d{3})(\d{3})$/.exec(p.replace(/\s/g, ""));
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Основа на slug-а: име + година на смъртта („ivan-petrov-2026“). */
export function obituarySlugBase(fullName: string, deathDate: Date | null): string {
  return slugify(`${fullName} ${deathDate ? deathDate.getUTCFullYear() : ""}`);
}

// --- Срок за данните на подателя ---

/** Името и телефонът на подателя се трият 30 дни след последната промяна. */
export const CONTACT_RETENTION_DAYS = 30;
/** Колко често (най-много) се пуска чистенето — то е „мързеливо“, при посещение. */
export const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function contactPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CONTACT_RETENTION_DAYS * DAY_MS);
}

export function shouldRunPurge(lastRunMs: number, nowMs: number): boolean {
  return lastRunMs === 0 || nowMs - lastRunMs >= PURGE_INTERVAL_MS || nowMs < lastRunMs;
}

// --- Какво НЕ пускаме в публичния текст ---

export type ForbiddenReason = "link" | "iban" | "phone" | "egn";

export const FORBIDDEN_MESSAGES: Record<ForbiddenReason, string> = {
  link: "Моля, без линкове в текста. Ако е нужно, напишете ни и ще ги добавим след проверка.",
  iban:
    "Не публикуваме банкови сметки и молби за дарения без проверка — заради измамите. Обадете ни се и ще го уредим заедно.",
  phone:
    "Не пишете телефони в текста — те ще се виждат от всички. Вашият телефон за връзка с нас е в отделното поле по-долу.",
  egn: "Моля, без ЕГН и други лични номера в текста.",
};

const LINK_RE =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|bg|net|org|eu|info|me|io|ly|link|site|online|shop)\b/i;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}/i;
const MONEY_WORDS_RE = /\biban\b|банков[аи]\s+сметк|сметка\s+за\s+дарени|\brevolut\b|\bpaypal\b/i;
// Български номера: 0… (9–10 цифри) или +359/00359 …; чужди: +<код> …
// Години („1945 – 2026“) и дати („24.10.2026“) не започват с 0 + 8 цифри,
// затова не се хващат.
const PHONE_RE =
  /(?:\+|00)359[\s-]?\d(?:[\s-]?\d){7,8}|(?<!\d)0\d(?:[\s-]?\d){7,8}(?!\d)|\+\d{1,3}[\s-]?\d(?:[\s-]?\d){6,12}/;
const EGN_RE = /(?<!\d)\d{10}(?!\d)/;

/** Първата причина, поради която текстът не може да се публикува; иначе null. */
export function findForbidden(text: string): ForbiddenReason | null {
  if (!text) return null;
  if (LINK_RE.test(text)) return "link";
  if (IBAN_RE.test(text) || MONEY_WORDS_RE.test(text)) return "iban";
  if (PHONE_RE.test(text)) return "phone";
  if (EGN_RE.test(text)) return "egn";
  return null;
}

// --- Формата за близките ---

export const CONSENT_TEXT =
  "Аз съм близък на починалия и имам съгласието на семейството да публикувам";

const optText = (max: number, msg: string) =>
  z.string().trim().max(max, msg).optional().default("");

/** Нормализира текста от близките: без управляващи знаци и без празни купчини. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ObituarySubmission = {
  kind: ObituaryKind;
  fullName: string;
  birthYear: number | null;
  deathDate: Date | null;
  ceremonyAt: Date | null;
  ceremonyPlace: string;
  text: string;
  fromFamily: string;
  contactName: string;
  contactPhone: string;
};

/**
 * Zod схема за формата /pomeni/nov. `now` е параметър, за да се тестват
 * границите на датите. Полетата идват от FormData като низове.
 */
export function obituarySubmissionSchema(now: Date = new Date()) {
  const today = sofiaTodayUtc(now);
  const thisYear = new Date(today).getUTCFullYear();

  return z
    .object({
      kind: z.enum(OBITUARY_KINDS, {
        errorMap: () => ({ message: "Изберете дали подавате некролог или помен." }),
      }),
      fullName: z
        .string()
        .trim()
        .min(3, "Въведете името на починалия (име и фамилия).")
        .max(120, "Името е твърде дълго.")
        .refine(
          (v) => /^[\p{L}\s.'’„“"-]+$/u.test(v),
          "В името пишете само букви (без цифри и знаци).",
        ),
      birthYear: optText(4, "Годината на раждане е с 4 цифри, напр. 1945.").refine(
        (v) => v === "" || /^\d{4}$/.test(v),
        "Годината на раждане е с 4 цифри, напр. 1945.",
      ),
      deathDate: optText(10, "Проверете датата на смъртта.").refine(
        (v) => v === "" || parseDateInput(v) !== null,
        "Проверете датата на смъртта.",
      ),
      ceremonyDate: optText(10, "Проверете датата на погребението или помена.").refine(
        (v) => v === "" || parseDateInput(v) !== null,
        "Проверете датата на погребението или помена.",
      ),
      ceremonyTime: optText(8, "Проверете часа.").refine(
        (v) => v === "" || parseTimeInput(v) !== null,
        "Проверете часа (напр. 11:00).",
      ),
      ceremonyPlace: optText(160, "Мястото е описано твърде дълго (до 160 знака)."),
      text: optText(2000, "Текстът е твърде дълъг (до 2000 знака).").transform(cleanText),
      fromFamily: optText(120, "Подписът е твърде дълъг (до 120 знака)."),
      contactName: z
        .string()
        .trim()
        .min(2, "Напишете вашето име — за да знаем с кого да говорим.")
        .max(80, "Името е твърде дълго."),
      contactPhone: z
        .string()
        .trim()
        .max(30, "Проверете телефона.")
        .refine((v) => {
          const digits = v.replace(/\D/g, "").length;
          return /^[+\d][\d\s().\-/]*$/.test(v) && digits >= 6 && digits <= 15;
        }, "Напишете телефон, на който да ви се обадим за проверка."),
      consent: z.literal("on", {
        errorMap: () => ({
          message: "Отбележете, че сте близък на починалия и имате съгласието на семейството.",
        }),
      }),
      website: z.string().max(0, "Невалидни данни.").optional().default(""), // honeypot
    })
    .superRefine((v, ctx) => {
      for (const field of ["fullName", "ceremonyPlace", "text", "fromFamily"] as const) {
        const reason = findForbidden(v[field]);
        if (reason) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: FORBIDDEN_MESSAGES[reason] });
          return;
        }
      }

      const death = v.deathDate ? parseDateInput(v.deathDate) : null;
      if (death) {
        if (death.getTime() > today || death.getUTCFullYear() < 1900) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deathDate"],
            message: "Датата на смъртта не може да е в бъдещето.",
          });
          return;
        }
      }

      if (v.birthYear) {
        const b = Number(v.birthYear);
        const limit = death ? death.getUTCFullYear() : thisYear;
        if (b < 1880 || b > limit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["birthYear"],
            message: "Проверете годината на раждане.",
          });
          return;
        }
      }

      if ((v.ceremonyDate === "") !== (v.ceremonyTime === "")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [v.ceremonyDate ? "ceremonyTime" : "ceremonyDate"],
          message: "За погребението или помена напишете и дата, и час (или оставете и двете празни).",
        });
        return;
      }
      const cd = v.ceremonyDate ? parseDateInput(v.ceremonyDate) : null;
      if (cd && (cd.getTime() < today - 60 * DAY_MS || cd.getTime() > today + 366 * DAY_MS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ceremonyDate"],
          message: "Проверете датата на погребението или помена.",
        });
      }
    })
    .transform((v): ObituarySubmission => {
      const cd = v.ceremonyDate ? parseDateInput(v.ceremonyDate) : null;
      const ct = v.ceremonyTime ? parseTimeInput(v.ceremonyTime) : null;
      return {
        kind: v.kind,
        fullName: v.fullName.replace(/\s+/g, " "),
        birthYear: v.birthYear ? Number(v.birthYear) : null,
        deathDate: v.deathDate ? parseDateInput(v.deathDate) : null,
        ceremonyAt: cd && ct !== null ? combineDateTime(cd, ct) : null,
        ceremonyPlace: v.ceremonyPlace.replace(/\s+/g, " "),
        text: v.text,
        fromFamily: v.fromFamily.replace(/\s+/g, " "),
        contactName: v.contactName.replace(/\s+/g, " "),
        contactPhone: v.contactPhone,
      };
    });
}

/** Имената на полетата на формата (без honeypot) — за връщане на въведеното. */
export const FORM_FIELDS = [
  "kind",
  "fullName",
  "birthYear",
  "deathDate",
  "ceremonyDate",
  "ceremonyTime",
  "ceremonyPlace",
  "text",
  "fromFamily",
  "contactName",
  "contactPhone",
  "consent",
] as const;
export type FormField = (typeof FORM_FIELDS)[number];

/** Писмо до редакцията — БЕЗ лични данни (само че има нова обява и къде е). */
export function moderationMail(kind: string, siteUrl: string): { subject: string; text: string } {
  const label = kindInfo(kind).label.toLowerCase();
  return {
    subject: `Нов ${label} чака одобрение`,
    text: [
      `През сайта е подаден нов ${label}.`,
      "Обещали сме преглед до 24 часа: обадете се на подателя за проверка и тогава публикувайте.",
      "",
      `Чакащи одобрение: ${siteUrl}/admin/pomeni?filter=pending`,
    ].join("\n"),
  };
}
