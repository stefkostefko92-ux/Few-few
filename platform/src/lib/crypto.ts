import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// Криптиране на API ключовете на сайтовете при съхранение (AES-256-GCM).
// Ключът идва от ENCRYPTION_KEY (32 байта в hex). Извън продукция ползваме
// детерминиран dev ключ с предупреждение, за да работи разработката без setup.

const ALGO = "aes-256-gcm";
let warned = false;

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY липсва или е невалиден (нужни са 32 байта в hex, т.е. 64 шестнайсетични знака). Генерирай: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (!warned) {
    console.warn(
      "⚠️  ENCRYPTION_KEY не е зададен — ползвам НЕСИГУРЕН dev ключ. Само за разработка!",
    );
    warned = true;
  }
  // Детерминиран dev ключ (само извън продукция).
  return createHash("sha256").update("platform-dev-key").digest();
}

// Връща низ вида: base64(iv).base64(authTag).base64(ciphertext)
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Повреден криптиран запис.");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// Показва само последните няколко знака на ключ (за UI, без да го разкрива).
export function maskSecret(plain: string): string {
  if (plain.length <= 4) return "••••";
  return `••••${plain.slice(-4)}`;
}
