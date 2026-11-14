// Лицензионни ключове и офлайн лицензи за Carbon Stealth POS.
//
// Модел (индустриална практика — Keygen/Paddle стил):
// 1) Активационен ключ CSPOS-XXXXX-XXXXX-XXXXX-XXXXX — случаен, пази се само
//    като SHA-256 хеш в базата (както парола). Показва се веднъж при покупка.
// 2) При активация сървърът връща Ed25519-ПОДПИСАН лицензен blob — касата го
//    проверява ОФЛАЙН с вградения публичен ключ (offline-first магазини).
//    За абонаменти blob-ът носи expiresAt = край на периода + гратис;
//    lifetime е без срок. Касата периодично си подновява blob-а онлайн.

import crypto from "node:crypto";

// Crockford Base32 — без объркващи знаци (0/O, 1/I/L)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Генерира активационен ключ: CSPOS-XXXXX-XXXXX-XXXXX-XXXXX (100 бита ентропия). */
export function generateKey() {
  const bytes = crypto.randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % 32];
  return `CSPOS-${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

/** Нормализира въведен ключ (малки букви, интервали, липсващи тирета). */
export function normalizeKey(raw) {
  const s = String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!s.startsWith("CSPOS") || s.length !== 25) return null;
  const body = s.slice(5);
  return `CSPOS-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}`;
}

/** SHA-256 хеш на ключа — само това се пази в базата. */
export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Подписан лицензен blob (base64url JSON + Ed25519 подпис) за офлайн проверка.
 * payload: { v, licenseId, plan, seats, deviceId, issuedAt, expiresAt|null }
 */
export function signLicenseBlob(payload, privateKeyPem) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .sign(null, Buffer.from(body), crypto.createPrivateKey(privateKeyPem))
    .toString("base64url");
  return `${body}.${sig}`;
}

/** Проверява blob срещу публичния ключ; връща payload или null. */
export function verifyLicenseBlob(blob, publicKeyPem) {
  const parts = String(blob ?? "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const ok = crypto.verify(
      null,
      Buffer.from(body),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(sig, "base64url")
    );
    if (!ok) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

/** Генерира Ed25519 двойка ключове (PEM) — еднократно, при настройка. */
export function generateSigningKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}
