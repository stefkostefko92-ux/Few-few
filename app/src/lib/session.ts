// Подписани сесийни токени с Web Crypto (HMAC-SHA256). Работи и в Edge
// (middleware), и в Node (сървърни компоненти/действия) — затова няма импорти,
// специфични за сървъра. Cookie помощниците са отделно в lib/auth.ts.

export const SESSION_COOKIE = "dup_session";

export type SessionPayload = {
  sub: string; // имейл/идентификатор на администратора
  role: "ADMIN";
  exp: number; // unix секунди
};

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Помощник: гарантира ArrayBuffer-базиран изглед (избягва типовия конфликт
// между Uint8Array<ArrayBufferLike> и BufferSource в Web Crypto).
function buf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    buf(new TextEncoder().encode(secret())),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(
  payload: Omit<SessionPayload, "exp"> & { ttlSeconds?: number },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (payload.ttlSeconds ?? 60 * 60 * 12);
  const body: SessionPayload = { sub: payload.sub, role: payload.role, exp };
  const json = JSON.stringify(body);
  const data = new TextEncoder().encode(json);
  const payloadB64 = b64urlEncode(data);
  const sig = await crypto.subtle.sign("HMAC", await key(), buf(data));
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  try {
    const data = b64urlToBytes(payloadB64);
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      buf(b64urlToBytes(sigB64)),
      buf(data),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(data)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
