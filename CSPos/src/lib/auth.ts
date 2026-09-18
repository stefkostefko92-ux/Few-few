// Автентикация: вход с код на оператор + ПИН (bcrypt), сесия в подписан JWT
// (jose, HS256) в httpOnly бисквитка. Ролите ограничават API-то и навигацията.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_HOURS, type RoleKey } from "./constants";

export interface SessionData {
  userId: string;
  name: string;
  role: RoleKey;
  operatorCode: number;
  /** Одиторски профил: вижда като ролята си, но не може да пише (Прил. № 29, т. 19). */
  readOnly?: boolean;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // HS256 иска ≥256-битов ключ; `openssl rand -hex 32` дава 64 знака
    throw new Error("SESSION_SECRET липсва или е твърде къс (мин. 32 знака)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(data: SessionData): Promise<void> {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(secretKey());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_HOURS * 3600,
    path: "/",
  });
}

export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: String(payload.userId),
      name: String(payload.name),
      role: payload.role as RoleKey,
      operatorCode: Number(payload.operatorCode),
      readOnly: payload.readOnly === true,
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Изисква сесия; хвърля Response 401 за API маршрути. */
export async function requireSession(): Promise<SessionData> {
  const s = await getSession();
  if (!s) throw jsonError(401, "Изисква се вход в системата.");
  return s;
}

const ROLE_ORDER: Record<RoleKey, number> = { CASHIER: 0, MANAGER: 1, ADMIN: 2 };

/**
 * Изисква минимална роля (CASHIER < MANAGER < ADMIN) И право на ЗАПИС.
 *
 * Одиторският профил (`readOnly`) се отказва ТУК, по подразбиране. Посоката е нарочна: ако някой
 * добави нов пишещ маршрут и забрави да мисли за одитора, маршрутът пада ЗАТВОРЕН (одиторът не
 * може да пише) вместо отворен. Обратната наредба — да пускаме и после да добавяме забрани —
 * значи всеки пропуснат маршрут е тиха дупка в СУПТО профила.
 *
 * За четящи маршрути ползвай `requireRead`.
 */
export async function requireRole(min: RoleKey): Promise<SessionData> {
  const s = await requireRead(min);
  if (s.readOnly) {
    throw jsonError(403, "Одиторският профил е само за четене — операцията е отказана.");
  }
  return s;
}

/** Изисква минимална роля, но ДОПУСКА одиторския профил (само за четящи маршрути). */
export async function requireRead(min: RoleKey): Promise<SessionData> {
  const s = await requireSession();
  if (ROLE_ORDER[s.role] < ROLE_ORDER[min]) {
    throw jsonError(403, "Нямате права за тази операция.");
  }
  return s;
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Обвива API handler: превръща хвърлени Response в отговор, друго — в 500. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cspos api]", e);
    const message = e instanceof Error ? e.message : "Вътрешна грешка.";
    return Response.json({ error: message }, { status: 500 });
  }
}
