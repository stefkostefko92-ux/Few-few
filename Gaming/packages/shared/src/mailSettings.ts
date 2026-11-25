import { z } from "zod";

/**
 * Пощата на портала (Brevo SMTP), настроена от собственика (OWNER) в админ
 * панела — по модела на Rilievi Impianti („Email del portale“ от конзолата на
 * MASTER). Докато е включена, има предимство пред SMTP_* от .env на сървъра.
 */

/** 587 и 2525 — STARTTLS (2525 минава и при хостинг, който блокира 587); 465 — TLS от началото. */
export const MAIL_PORTS = [587, 2525, 465] as const;
export type MailPort = (typeof MAIL_PORTS)[number];

/** Стойностите по подразбиране за нова настройка (Brevo SMTP relay). */
export const BREVO_DEFAULTS = {
  host: "smtp-relay.brevo.com",
  port: 587 as MailPort,
  fromName: "АСО",
  fromEmail: "no-reply@gaming.carbonstealth.eu",
} as const;

const CONTROL = /\p{Cc}/u;

/**
 * Формата в админ панела. Ключът (`password`) — празен = остава записаният; никога
 * не се връща от сървъра. `accountPassword` — паролата на собственика: оттук
 * тръгват всички писма (потвърждения, нови пароли), затова записът иска нея.
 */
export const mailSettingsSchema = z
  .object({
    host: z.string().trim().toLowerCase().min(1).max(253),
    port: z
      .number()
      .int()
      .refine((p) => (MAIL_PORTS as readonly number[]).includes(p), "invalid_port"),
    username: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .refine((v) => !/\s/.test(v) && !CONTROL.test(v), "invalid_username"),
    // Без trim: интервал в края може да е част от ключа.
    password: z
      .string()
      .max(512)
      .refine((v) => !CONTROL.test(v), "invalid_password"),
    fromName: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((v) => !/[<>"\\]/.test(v) && !CONTROL.test(v), "invalid_from_name"),
    fromEmail: z.string().trim().toLowerCase().max(254).email(),
    accountPassword: z.string().min(1).max(256),
  })
  .strict();
export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;

/** Потвърждение с паролата за изключване. */
export const mailDisableSchema = z.object({ accountPassword: z.string().min(1).max(256) }).strict();

/** Откъде тръгват писмата сега: от панела, от .env, или от никъде (само в лога). */
export type MailSource = "console" | "env" | null;

export interface MailSettingsView {
  /** Записаното в панела (без ключа); null — нищо не е записано. */
  settings: {
    host: string;
    port: number;
    username: string;
    fromName: string;
    fromEmail: string;
    active: boolean;
    updatedAt: string;
    updatedBy: string | null;
  } | null;
  /** Има ли записан ключ (самият ключ никога не излиза). */
  hasPassword: boolean;
  source: MailSource;
  /** Има ли SETTINGS_SECRET_KEY на сървъра (без него записът е изключен). */
  keyReady: boolean;
}

/** Пробното писмо: само кодът на грешката (текстът на сървъра може да цитира адреси). */
export type MailTestResult = { result: "sent"; to: string } | { result: "disabled" } | { result: "error"; code: string };
