import { createHmac, randomBytes } from "node:crypto";

// TOTP (RFC 6238) — двуфакторна автентикация, без външна зависимост.
// Тайната се пази base32; проверката е с прозорец ±1 стъпка (30 сек).

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Нова тайна (20 байта → base32), подходяща за Google Authenticator и др.
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // 64-битов брояч (big-endian).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, "0");
}

// Кодът за даден момент (по подразбиране сега), стъпка 30 сек.
export function totp(secret: string, atMs = 0): string {
  const t = atMs || 0;
  const counter = Math.floor((t || nowMs()) / 1000 / 30);
  return hotp(secret, counter);
}

function nowMs(): number {
  return typeof Date.now === "function" ? Date.now() : 0;
}

// Проверява код с прозорец ±window стъпки (толерантност към разминаване в часа).
export function verifyTotp(secret: string, token: string, atMs = 0, window = 1): boolean {
  const clean = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const base = Math.floor((atMs || nowMs()) / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, base + w) === clean) return true;
  }
  return false;
}

// otpauth:// URI за QR код / ръчно въвеждане.
export function otpauthUri(secret: string, account: string, issuer = "Carbon Stealth"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
