// Ключове, изведени (HKDF-SHA256, отделен етикет за всяко предназначение) от SEAL_KEY (32 байта hex,
// тайна на сървъра, в бекъпа на тайните): шифроване на 2FA тайните, HMAC на резервните кодове и на IP-тата.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const IV = 12;
const TAG = 16;

export interface Sigillo {
  cifra(info: string, testo: string): string;
  decifra(info: string, valore: string): string;
  hmac(info: string, testo: string): string;
}

export function sigillo(sealKeyHex: string): Sigillo {
  if (!/^[0-9a-f]{64}$/i.test(sealKeyHex)) throw new Error("SEAL_KEY deve essere di 32 byte in esadecimale");
  const ikm = Buffer.from(sealKeyHex, "hex");
  const cache = new Map<string, Buffer>();
  const chiave = (info: string) => {
    let k = cache.get(info);
    if (!k) {
      k = Buffer.from(hkdfSync("sha256", ikm, "liftcon", info, 32));
      cache.set(info, k);
    }
    return k;
  };
  return {
    cifra(info, testo) {
      const iv = randomBytes(IV);
      const c = createCipheriv("aes-256-gcm", chiave(info), iv);
      const enc = Buffer.concat([c.update(testo, "utf8"), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
    },
    decifra(info, valore) {
      const buf = Buffer.from(valore, "base64url");
      const d = createDecipheriv("aes-256-gcm", chiave(info), buf.subarray(0, IV));
      d.setAuthTag(buf.subarray(IV, IV + TAG));
      return Buffer.concat([d.update(buf.subarray(IV + TAG)), d.final()]).toString("utf8");
    },
    hmac(info, testo) {
      return createHmac("sha256", chiave(info)).update(testo).digest("hex");
    },
  };
}

export function ugualeCostante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
