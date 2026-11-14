// Пощата на сайта (Brevo SMTP), настроена от администратора в панела — по
// образеца на rilievi (#32, „Email del portale“ в конзолата на MASTER).
//
// Чист модул без `server-only` и без база: формата, шифроването на ключа и
// изборът „панел → .env → без поща“ се тестват директно.
//
// Правила:
//   • сървърът — име на хост (в продукция никога IP или localhost: панелът не е
//     скенер на вътрешната мрежа); портовете — само тези на Brevo;
//   • логинът и ключът — без управляващи знаци (нови редове = SMTP команди);
//     името на подателя — без < > " \ (заглавия на писмото);
//   • ключът само се пише: в базата е шифрован (AES-256-GCM, ключ от AUTH_SECRET
//     през HKDF), никога не се показва, не влиза в одита и в лога; празно поле —
//     остава записаният, но НЕ и при нов сървър или нов логин (иначе ключът би
//     отишъл при непознат сървър).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { SMTP_PORTS, type SmtpPort } from "@/lib/mail-ports";

export { BREVO_HOST, SMTP_PORTS, type SmtpPort } from "@/lib/mail-ports";

export const DEFAULT_FROM = "no-reply@carbonstealth.eu";

export type MailFormValues = {
  host: string;
  port: SmtpPort;
  user: string;
  /** null — остава записаният ключ. */
  key: string | null;
  fromName: string;
  fromEmail: string;
};
export type MailField = keyof MailFormValues;
export type MailFormResult =
  | { ok: true; values: MailFormValues }
  | { ok: false; errors: Partial<Record<MailField, string>> };

export const MAIL_ERRORS = {
  host: "Въведете името на сървъра, например smtp-relay.brevo.com (без http:// и без IP адрес).",
  port: "Изберете порт 587, 2525 или 465.",
  user: "Въведете SMTP логина от Brevo (без интервали).",
  key: "Поставете SMTP ключа от Brevo.",
  keyNewServer:
    "Сменихте сървъра или логина — поставете ключа отново (записаният не се праща към нов сървър).",
  fromName: "Името на подателя е до 80 знака, без < > \" и \\.",
  fromEmail: "Проверете адреса на подателя — трябва да е като no-reply@carbonstealth.eu.",
} as const;

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CONTROL = /\p{Cc}/u;
const EMAIL = /^[^\s@<>"(),;:\\]+@[^\s@<>"(),;:\\]+\.[^\s@<>"(),;:\\]+$/;

function hostOf(raw: string, production: boolean): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > 253) return null;
  if (!production && (v === "localhost" || isIP(v) !== 0)) return v;
  return HOSTNAME.test(v) ? v : null;
}

/** Чете формата строго. `raw` — текстовите полета (липсващо → ""). */
export function parseMailForm(
  raw: Record<string, string>,
  opts: {
    production: boolean;
    keySaved: boolean;
    /** Записаните сървър и логин — само за тях важи записаният ключ. */
    saved?: { host: string; user: string } | null;
  },
): MailFormResult {
  const errors: Partial<Record<MailField, string>> = {};
  const get = (k: string) => raw[k] ?? "";

  const host = hostOf(get("host"), opts.production);
  if (!host) errors.host = MAIL_ERRORS.host;

  const portNum = Number(get("port").trim());
  const port = SMTP_PORTS.find((p) => p === portNum) ?? null;
  if (port === null) errors.port = MAIL_ERRORS.port;

  const user = get("user").trim();
  if (!user || user.length > 254 || /\s/.test(user) || CONTROL.test(user)) errors.user = MAIL_ERRORS.user;

  // Ключът — както е поставен (без trim: интервал в края може да е част от него).
  const keyRaw = get("key");
  let key: string | null = null;
  if (keyRaw.length === 0) {
    if (!opts.keySaved) errors.key = MAIL_ERRORS.key;
    else if (opts.saved && host && (host !== opts.saved.host || user !== opts.saved.user))
      errors.key = MAIL_ERRORS.keyNewServer;
  } else if (keyRaw.length > 512 || CONTROL.test(keyRaw)) {
    errors.key = MAIL_ERRORS.key;
  } else {
    key = keyRaw;
  }

  const fromName = get("fromName").trim();
  if (!fromName || fromName.length > 80 || /[<>"\\]/.test(fromName) || CONTROL.test(fromName))
    errors.fromName = MAIL_ERRORS.fromName;

  const fromEmail = get("fromEmail").trim().toLowerCase();
  if (fromEmail.length > 254 || CONTROL.test(fromEmail) || !EMAIL.test(fromEmail))
    errors.fromEmail = MAIL_ERRORS.fromEmail;

  if (Object.keys(errors).length > 0 || !host || port === null) return { ok: false, errors };
  return { ok: true, values: { host, port, user, key, fromName, fromEmail } };
}

// ── Шифроване на ключа ──────────────────────────────────────────────────────
// Ключът за шифроване се извежда от AUTH_SECRET (HKDF-SHA256, свой етикет):
// друг етикет = друг, независим ключ. Смяна на AUTH_SECRET = ключът на пощата
// вече не се разшифрова → пощата минава на .env, а администраторът го поставя
// наново (страницата го казва).
const SALT = "zabobovdol";
const LABEL = "smtp-key-v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function derive(secret: string): Buffer {
  if (secret.length < 32) throw new Error("AUTH_SECRET липсва или е твърде кратък");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), SALT, LABEL, 32));
}

/** AES-256-GCM: IV (12) + етикет (16) + шифротекст, base64. */
export function sealSmtpKey(secret: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", derive(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Разшифрова или null (подправен запис, друг AUTH_SECRET) — никога не хвърля. */
export function openSmtpKey(secret: string, payload: string): string | null {
  try {
    const raw = Buffer.from(payload, "base64");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", derive(secret), raw.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

// ── Откъде тръгват писмата ──────────────────────────────────────────────────
export type MailSource = "панел" | ".env";

export type SmtpParams = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string | { name: string; address: string };
  source: MailSource;
};

/** Записаното в панела (SiteSetting), както е в базата. */
export type MailDbValues = Partial<
  Record<"enabled" | "host" | "port" | "user" | "keyEnc" | "fromName" | "fromEmail", string>
>;

export type ResolvedMail = {
  params: SmtpParams | null;
  /** Панелът е включен, но ключът не се разшифрова (сменен AUTH_SECRET) — важи .env. */
  panelKeyBroken: boolean;
};

/**
 * Панелът (ако е включен и пълен) е над .env; иначе .env; иначе без поща.
 * Повреден запис в панела не спира пощата — важи .env.
 */
export function resolveSmtp(
  db: MailDbValues,
  env: Record<string, string | undefined>,
  secret: string,
): ResolvedMail {
  let panelKeyBroken = false;
  if (db.enabled === "1" && db.host && db.user && db.keyEnc && db.fromEmail) {
    const port = SMTP_PORTS.find((p) => p === Number(db.port));
    const pass = openSmtpKey(secret, db.keyEnc);
    if (pass === null) panelKeyBroken = true;
    else if (port !== undefined)
      return {
        panelKeyBroken,
        params: {
          host: db.host,
          port,
          secure: port === 465,
          user: db.user,
          pass,
          from: db.fromName ? { name: db.fromName, address: db.fromEmail } : db.fromEmail,
          source: "панел",
        },
      };
  }
  if (!env.SMTP_HOST || !env.SMTP_PORT) return { params: null, panelKeyBroken };
  const auth = Boolean(env.SMTP_USER && env.SMTP_PASS);
  return {
    panelKeyBroken,
    params: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: env.SMTP_SECURE === "true",
      user: auth ? env.SMTP_USER : undefined,
      pass: auth ? env.SMTP_PASS : undefined,
      from: env.SMTP_FROM || DEFAULT_FROM,
      source: ".env",
    },
  };
}

/** Кодът на грешка от nodemailer (EAUTH, ECONNECTION…) — само ако изглежда като код. */
export function errorCodeOf(err: unknown): string {
  const raw = (err as { code?: unknown } | null)?.code;
  return typeof raw === "string" && /^[A-Z][A-Z0-9_]{1,30}$/.test(raw) ? raw : "EERROR";
}

/** Какво да направи човек при код от пробното писмо (без текста на сървъра — може да цитира адреси). */
export function hintForCode(code: string): string {
  if (code === "EAUTH") return "Грешен логин или ключ — копирайте ги наново от Brevo (SMTP & API → SMTP).";
  if (code === "EENVELOPE")
    return "Адресът на подателя не е приет — потвърдете го в Brevo (Senders, Domains & Dedicated IPs).";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(code))
    return "Сървърът не отговаря — проверете името и опитайте порт 2525.";
  if (code === "ETLS") return "Проблем с шифроването — за порт 465 трябва TLS; опитайте 587 или 2525.";
  return `Писмото не тръгна (код ${code}).`;
}
