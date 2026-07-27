// TOTP (RFC 6238) — втори фактор при вход.
//
// Реализиран върху `node:crypto`, без външна зависимост: алгоритъмът е трийсет
// реда, а всяка библиотека тук е още един пакет в веригата на доставка на
// продукт, който пази фискални и лични данни. Съвместим с Google Authenticator,
// Aegis, 1Password и всичко останало, което чете `otpauth://`.
//
// Чиста логика — тества се с векторите от самия RFC.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Стъпка от 30 секунди — стойността, която всички приложения очакват. */
export const PASSO_SECONDI = 30;
export const CIFRE = 6;

/**
 * Толеранс от ±1 стъпка.
 *
 * Часовникът на телефона и на сървъра се разминават; без толеранс потребител с
 * няколко секунди разлика не може да влезе никога. Повече от ±1 удължава
 * прозореца за отгатване без реална полза.
 */
export const FINESTRA = 1;

// ── Base32 (RFC 4648, без подпълване) — форматът на тайната в otpauth:// ────

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Codifica(buf: Buffer): string {
  let bit = 0;
  let valore = 0;
  let out = "";
  for (const b of buf) {
    valore = (valore << 8) | b;
    bit += 8;
    while (bit >= 5) {
      out += ALFABETO[(valore >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ALFABETO[(valore << (5 - bit)) & 31];
  return out;
}

export function base32Decodifica(s: string): Buffer {
  const pulito = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bit = 0;
  let valore = 0;
  const out: number[] = [];
  for (const c of pulito) {
    const i = ALFABETO.indexOf(c);
    if (i === -1) throw new Error("Base32 non valido");
    valore = (valore << 5) | i;
    bit += 5;
    if (bit >= 8) {
      out.push((valore >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(out);
}

/** Нова тайна: 20 байта = 160 бита, колкото препоръчва RFC 4226. */
export function generaSegreto(): string {
  return base32Codifica(randomBytes(20));
}

/** Кодът за даден момент. */
export function codice(segretoBase32: string, perMs = Date.now()): string {
  const chiave = base32Decodifica(segretoBase32);
  const contatore = Math.floor(perMs / 1000 / PASSO_SECONDI);

  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(contatore / 2 ** 32), 0);
  buf.writeUInt32BE(contatore >>> 0, 4);

  // HMAC-SHA1 е това, което RFC 6238 предписва и което очакват приложенията.
  const hmac = createHmac("sha1", chiave).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binario % 10 ** CIFRE).padStart(CIFRE, "0");
}

/**
 * Проверява подадения код в прозореца ±FINESTRA.
 *
 * Сравнението е с постоянно време: обикновеното `===` върху низове излиза
 * рано при първата различна цифра и издава колко от кода е познат.
 */
export function verifica(
  segretoBase32: string,
  fornito: string,
  perMs = Date.now(),
): boolean {
  const pulito = fornito.replace(/\s/g, "");
  if (!/^\d{6}$/.test(pulito)) return false;
  const atteso = Buffer.from(pulito, "utf8");
  for (let d = -FINESTRA; d <= FINESTRA; d++) {
    const c = Buffer.from(
      codice(segretoBase32, perMs + d * PASSO_SECONDI * 1000),
      "utf8",
    );
    if (c.length === atteso.length && timingSafeEqual(c, atteso)) return true;
  }
  return false;
}

/** URI за QR кода, който приложението сканира. */
export function uriOtpauth(
  segreto: string,
  email: string,
  emittente = "ERP Ascensori",
): string {
  const e = encodeURIComponent(emittente);
  return `otpauth://totp/${e}:${encodeURIComponent(email)}?secret=${segreto}&issuer=${e}&algorithm=SHA1&digits=${CIFRE}&period=${PASSO_SECONDI}`;
}

/**
 * Резервни кодове за еднократна употреба.
 *
 * Без тях загубен телефон значи загубен акаунт, а единственият изход е
 * администратор да изключи втория фактор — тоест вратичка, която обезсмисля
 * самата мярка. Пазят се като хеш, не в чист вид.
 */
export function generaCodiciRecupero(quanti = 8): string[] {
  return Array.from({ length: quanti }, () =>
    randomBytes(5)
      .toString("hex")
      .toUpperCase()
      .match(/.{1,5}/g)!
      .join("-"),
  );
}
