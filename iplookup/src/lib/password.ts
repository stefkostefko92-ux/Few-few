import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Хеширане и проверка на пароли.
 *
 * Отделено от `session.ts` нарочно: жетоните се проверяват и в Edge средата
 * (middleware), където `node:crypto` не съществува. Паролите се проверяват
 * само на сървъра при вход, затова scrypt може да живее тук.
 *
 * Няма `server-only`: модулът е чиста криптография и трябва да е тестваем без
 * Next. Защитата идва от единствения му ползвател — `users.ts`, който е
 * `server-only` — а и `node:crypto` така или иначе не съществува в браузър.
 */

const SCRYPT_KEYLEN = 64;
/**
 * `N=2^15` е компромисът, който OWASP приема за интерактивен вход: достатъчно
 * бавен срещу подбор, достатъчно бърз за човек.
 */
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 };


/** `scrypt$N$r$p$сол$ключ` — параметрите се пазят В хеша, за да могат да се сменят. */
export function hashPassword(password: string, salt?: Buffer): string {
  const useSalt = salt ?? randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), useSalt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    useSalt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  let derived: Buffer;
  try {
    expected = Buffer.from(parts[5] ?? "", "base64");
    derived = scryptSync(password.normalize("NFKC"), Buffer.from(parts[4] ?? "", "base64"), expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }

  return expected.length > 0 && expected.length === derived.length && timingSafeEqual(expected, derived);
}
