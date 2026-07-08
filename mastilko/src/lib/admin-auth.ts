import { SignJWT, jwtVerify } from "jose";

// Админ вход: потребител + парола. Няколко админа се задават в env
// MASTILKO_ADMINS = "user1:bcryptHash1;user2:bcryptHash2". Сесията е подписан
// JWT (jose, HS256 със SESSION_SECRET), сложен в httpOnly бисквитка. Само
// администраторът получава бисквитка — посетителите нямат нито една.

export const ADMIN_COOKIE = "mastilko_admin";
const MAX_AGE_S = 8 * 60 * 60; // 8 часа

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET липсва или е твърде къс (мин. 32 знака).");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(user: string): Promise<string> {
  return new SignJWT({ u: user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

/** Връща потребителя от валидна сесия или null (ползва се и в middleware). */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const COOKIE_MAX_AGE = MAX_AGE_S;
