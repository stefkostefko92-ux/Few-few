import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env.js";

/**
 * Шифроване на тайни, които собственикът въвежда в админ панела (ключът за Brevo
 * SMTP). AES-256-GCM с ключ, изведен (HKDF) от SETTINGS_SECRET_KEY — тайна само на
 * сървъра (.env, права 600), отделна от JWT тайните, за да не се губят настройките
 * при смяна на сесиите. В базата стои само „v1.<iv>.<tag>.<шифър>“ (base64url).
 */

const IV_BYTES = 12;

/** Има ли ключ за шифроване (без него конзолата за пощата не записва). */
export const settingsKeyReady = (): boolean => /^[0-9a-f]{64}$/i.test(env.SETTINGS_SECRET_KEY);

function derived(info: string): Buffer {
  const ikm = Buffer.from(env.SETTINGS_SECRET_KEY, "hex");
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), info, 32));
}

export function sealSecret(info: string, plaintext: string): string {
  if (!settingsKeyReady()) throw new Error("SETTINGS_SECRET_KEY липсва");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", derived(info), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** null — не се разшифрова (сменен ключ, повреден запис): както без настройка. */
export function openSecret(info: string, payload: string): string | null {
  if (!settingsKeyReady()) return null;
  const [v, iv, tag, body] = payload.split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derived(info), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const sealSmtpPassword = (plain: string): string => sealSecret("smtp-pass-v1", plain);
export const openSmtpPassword = (payload: string): string | null => openSecret("smtp-pass-v1", payload);
