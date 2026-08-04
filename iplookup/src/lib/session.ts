/**
 * Сесии и пароли за следственото издание.
 *
 * Нула външни зависимости — всичко идва от Web Crypto, който съществува и в
 * Node, и в Edge средата. Това не е педантизъм: пазачът (`middleware.ts`) върви
 * в Edge, където `node:crypto` го няма, а проверката на жетона трябва да е на
 * едно място, не на две.
 *
 * Паролите живеят в `password.ts` — те се проверяват само на сървъра.
 *
 * Сесията е подписан жетон, не запис в база. Така изходът от системата не
 * изисква състояние, а дневникът пази кой какво е правил — точно както иска
 * чл. 25 от Директива (ЕС) 2016/680.
 *
 * Чист модул: тайната и часовникът се подават отвън, значи е тестваем и
 * детерминистичен. Файловете с потребители живеят другаде.
 */

export type Role = "operator" | "supervisor" | "auditor";

/** Какво може всяка роля. Одиторът НЕ прави справки — той проверява дневника. */
export const ROLE_LABEL: Record<Role, string> = {
  operator: "заявител",
  supervisor: "ръководител",
  auditor: "одитор",
};

export interface SessionClaims {
  /** Индивидуален идентификатор на служителя. Споделени акаунти са забранени. */
  sub: string;
  /** Структурата, към която е служителят — влиза в дневника. */
  unit: string;
  role: Role;
  /** Издаден в (Unix секунди). */
  iat: number;
  /** Изтича в (Unix секунди). */
  exp: number;
}

export const DEFAULT_SESSION_SECONDS = 8 * 60 * 60;

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(input: string): Uint8Array {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return toBase64url(new Uint8Array(signature));
}

/** Сравнение с постоянно време — иначе подписът се познава байт по байт. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Издава жетон. Тайната идва от средата на сървъра, никога от кода. */
export async function issueToken(
  claims: Omit<SessionClaims, "iat" | "exp">,
  secret: string,
  now: number = Date.now(),
  lifetimeSeconds: number = DEFAULT_SESSION_SECONDS,
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const full: SessionClaims = { ...claims, iat: issuedAt, exp: issuedAt + lifetimeSeconds };
  const payload = toBase64url(encoder.encode(JSON.stringify(full)));
  return `${payload}.${await sign(payload, secret)}`;
}

/**
 * Проверява жетон. Връща `null` при всяка нередност — невалиден подпис,
 * изтекъл срок, объркан формат. Никога не хвърля и никога не казва КОЯ е
 * причината навън: разликата между „грешен подпис" и „изтекъл" е информация
 * за нападателя.
 */
export async function readToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  if (!constantTimeEqual(signature, await sign(payload, secret))) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as SessionClaims;
  } catch {
    return null;
  }

  if (typeof claims?.sub !== "string" || !claims.sub) return null;
  if (!isRole(claims.role)) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;

  return claims;
}

export function isRole(value: unknown): value is Role {
  return value === "operator" || value === "supervisor" || value === "auditor";
}

