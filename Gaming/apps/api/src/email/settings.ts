import { isIP } from "node:net";
import { prisma } from "@aso/db";
import type { MailSettingsInput, MailSettingsView, MailSource } from "@aso/shared";
import { env } from "../env.js";
import { HttpError } from "../http.js";
import { logger } from "../logger.js";
import { openSmtpPassword, sealSmtpPassword, settingsKeyReady } from "./secrets.js";

/**
 * Откъде тръгват писмата (по модела на Rilievi Impianti — пощата от конзолата):
 * настройката от админ панела (`MailSettings`, ключът — шифрован), докато е
 * включена; иначе SMTP_* от .env; иначе нищо (писмата само в лога). Помни се в
 * паметта за 60 с и се подменя веднага при запис — ако има няколко процеса на
 * API-то, другите я виждат до минута.
 */

export interface SmtpParams {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string | { name: string; address: string };
  source: Exclude<MailSource, null>;
}

const ROW = "mail";
const TTL_MS = 60_000;

let cached: { params: SmtpParams | null; at: number } | undefined;
let version = 0;

/** Сменя се при всяка нова настройка — транспортът на mailer.ts се прави наново. */
export const mailVersion = (): number => version;

async function loadConsole(): Promise<SmtpParams | null> {
  const row = await prisma.mailSettings.findUnique({ where: { id: ROW } });
  if (!row?.active) return null;
  const pass = openSmtpPassword(row.passwordEnc);
  if (pass === null) {
    // Сменен SETTINGS_SECRET_KEY или повреден запис — както без настройка.
    logger.error("mail settings: the SMTP key could not be decrypted");
    return null;
  }
  return {
    host: row.host,
    port: row.port,
    secure: row.port === 465,
    user: row.username,
    pass,
    from: { name: row.fromName, address: row.fromEmail },
    source: "console",
  };
}

async function reload(): Promise<void> {
  let params: SmtpParams | null = null;
  try {
    params = await loadConsole();
  } catch (err) {
    // Базата не отговаря — до следващия опит важи .env.
    logger.warn({ err }, "mail settings: could not read, using env");
  }
  cached = { params, at: Date.now() };
  version += 1;
}

function fromEnv(): SmtpParams | null {
  if (!env.SMTP_HOST) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : {}),
    from: env.EMAIL_FROM,
    source: "env",
  };
}

/** Параметрите, с които тръгва писмо сега, или null — пощата не е настроена. */
export async function smtpParams(): Promise<SmtpParams | null> {
  if (!cached || Date.now() - cached.at > TTL_MS) await reload();
  return cached!.params ?? fromEnv();
}

/** За тестове: забрави паметта. */
export function resetMailCache(): void {
  cached = undefined;
}

/** Страницата в админ панела: записаното (без ключа) и откъде тръгват писмата сега. */
export async function mailSettingsView(): Promise<MailSettingsView> {
  const row = await prisma.mailSettings.findUnique({ where: { id: ROW } });
  let updatedBy: string | null = null;
  if (row?.updatedById) {
    const u = await prisma.user.findUnique({ where: { id: row.updatedById }, select: { displayName: true } });
    updatedBy = u?.displayName ?? null;
  }
  const params = await smtpParams();
  return {
    settings: row
      ? {
          host: row.host,
          port: row.port,
          username: row.username,
          fromName: row.fromName,
          fromEmail: row.fromEmail,
          active: row.active,
          updatedAt: row.updatedAt.toISOString(),
          updatedBy,
        }
      : null,
    hasPassword: !!row,
    source: params?.source ?? null,
    keyReady: settingsKeyReady(),
  };
}

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Сървърните правила отгоре на Zod схемата: хостът е име на хост (в продукция
 * никога IP или localhost — панелът не е скенер на вътрешната мрежа); без записан
 * ключ — ключ е задължителен; друг сървър или друг логин със записания ключ —
 * ключът се пише наново (иначе ключът за Brevo би отишъл при непознат сървър).
 */
export function checkMailInput(
  input: MailSettingsInput,
  saved: { host: string; username: string } | null,
  production = env.isProd,
): void {
  const host = input.host;
  const localOk = !production && (host === "localhost" || isIP(host) !== 0);
  if (!localOk && !HOSTNAME.test(host)) throw new HttpError(400, "invalid_host", "Невалиден SMTP сървър");
  if (input.password.length === 0) {
    if (!saved) throw new HttpError(400, "password_required", "Въведи SMTP ключа");
    if (saved.host !== host || saved.username !== input.username) {
      throw new HttpError(400, "password_new_server", "Нов сървър или логин — въведи SMTP ключа наново");
    }
  }
}

/** Записва и включва настройката; празен ключ — остава записаният. */
export async function saveMailSettings(actorId: string, input: MailSettingsInput): Promise<void> {
  const data = {
    host: input.host,
    port: input.port,
    username: input.username,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    active: true,
    updatedById: actorId,
    ...(input.password.length > 0 ? { passwordEnc: sealSmtpPassword(input.password) } : {}),
  };
  const exists = await prisma.mailSettings.findUnique({ where: { id: ROW }, select: { id: true } });
  if (exists) {
    await prisma.mailSettings.update({ where: { id: ROW }, data });
  } else {
    await prisma.mailSettings.create({ data: { id: ROW, passwordEnc: sealSmtpPassword(input.password), ...data } });
  }
  await reload();
}

/** Изключва настройката (остава записана): писмата — пак от .env, ако го има. */
export async function disableMailSettings(actorId: string): Promise<boolean> {
  const { count } = await prisma.mailSettings.updateMany({
    where: { id: ROW, active: true },
    data: { active: false, updatedById: actorId },
  });
  await reload();
  return count > 0;
}
