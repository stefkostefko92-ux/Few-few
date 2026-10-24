// Решението на пазача на /admin — чиста логика (без NextRequest/NextResponse),
// за да се тества. Ползва го src/middleware.ts; там е само пренасочването.
// Проверката тук е първа линия; всяка сериозна операция допълнително
// проверява сесията на сървъра (auth.ts).
//
// Без `server-only` и без Node API — middleware върви в edge средата.
import { jwtVerify } from "jose";

/** Бисквитката със сесията (същата като в auth.ts). */
export const SESSION_COOKIE = "zbd_session";

/** Входът — единствената страница под /admin, достъпна без сесия. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Само /admin и /admin/… — не /administrator, не /admin-x. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export type AdminDecision = { allow: true } | { allow: false; next: string };

/**
 * Пускаме ли заявката към /admin/…? Без тайна или без валиден HS256 токен
 * (подпис, срок) → към входа с ?next=<пътя> (fail closed). Входът винаги
 * минава — иначе пренасочването би се въртяло в кръг.
 */
export async function adminGuardDecision(input: {
  pathname: string;
  token: string | undefined;
  secret: string | undefined;
}): Promise<AdminDecision> {
  const { pathname, token, secret } = input;
  if (pathname === ADMIN_LOGIN_PATH) return { allow: true };

  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
      });
      return { allow: true };
    } catch {
      // невалиден/изтекъл токен — към входа
    }
  }
  return { allow: false, next: pathname };
}
