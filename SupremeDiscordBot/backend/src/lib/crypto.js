// backend/src/lib/crypto.js
// AES-256-GCM encryption for sensitive fields stored in DB.
// Requires ENCRYPTION_KEY env var: 32-byte hex string (64 hex chars).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  // Read lazily so the key can be injected after module load (tests, late dotenv).
  const KEY_HEX = process.env.ENCRYPTION_KEY;
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string. " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(KEY_HEX, "hex");
}

/**
 * Encrypt a plaintext string. Returns a single string: iv:authTag:ciphertext (all hex).
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a value produced by encrypt(). Returns null if input is null/empty.
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const key = getKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error("Invalid ciphertext format");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(Buffer.from(encryptedHex, "hex")) + decipher.final("utf8");
}

// Строгата форма на нашия шифротекст: 12-байтов IV, 16-байтов authTag, тяло.
// Нужна е, за да различим „наследен открит текст“ от „наш шифротекст, който НЕ
// се дешифрира“ — двете искат ПРОТИВОПОЛОЖНО поведение, а `split(":").length`
// не ги различава (открит текст с две двоеточия минаваше за наш).
const CIPHERTEXT_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

// Дедуплициран сигнал: липсващ/сгрешен ENCRYPTION_KEY е конфигурационна авария,
// но не бива да залее лога с ред на всяка заявка.
let keyFailureLogged = false;

/**
 * Decrypt if the value looks like our iv:authTag:ciphertext format; otherwise
 * return it unchanged. Lets us roll out encryption of an existing column WITHOUT
 * a migration — legacy plaintext rows keep working and get re-encrypted on their
 * next write.
 *
 * ВАЖНО (07.08.2026): при провал на дешифрирането връщаме `null`, НЕ суровия
 * шифротекст. Старото поведение „fail-open“ беше тихо и вредно: при липсващ или
 * сгрешен ENCRYPTION_KEY шифротекстът тръгваше нататък като OAuth токен — тоест
 * пращахме нашия шифротекст на Discord, получавахме объркващо 401 и никъде не
 * пишеше, че истинската причина е конфигурацията. `null` кара повикващия да
 * поиска нов вход (коректната последица), а логът казва защо.
 */
export function decryptSafe(value) {
  if (!value) return value;
  if (!CIPHERTEXT_RE.test(value)) return value; // не е нашият формат → наследен открит текст
  try {
    return decrypt(value);
  } catch (err) {
    if (!keyFailureLogged) {
      keyFailureLogged = true;
      console.error(
        `🔐 Дешифрирането се провали (${err.message}). Провери ENCRYPTION_KEY — ` +
        "липсващ или сменен ключ прави ВСИЧКИ шифровани колони нечетими. " +
        "Този ред се показва веднъж на процес.",
      );
    }
    return null;
  }
}
