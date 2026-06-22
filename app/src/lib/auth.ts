// Сървърни помощници за вход в администрацията. Идентификацията е чрез
// конфигурация в средата (ADMIN_EMAIL/ADMIN_PASSWORD) — не изисква база данни.
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/session";

function adminEmail(): string {
  return process.env.ADMIN_EMAIL || "admin@zadupnitsa.eu";
}
function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Проверява подадените данни за вход. Връща true при успех.
export function checkCredentials(email: string, password: string): boolean {
  const pw = adminPassword();
  if (!pw) return false; // ако не е конфигуриран администратор, входът е изключен
  return safeEqual(email.trim().toLowerCase(), adminEmail().toLowerCase()) &&
    safeEqual(password, pw);
}

export async function createSessionCookie(email: string): Promise<void> {
  const token = await signSession({ sub: email, role: "ADMIN" });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("Неоторизиран достъп");
  return s;
}

export function isAdminConfigured(): boolean {
  return Boolean(adminPassword());
}
