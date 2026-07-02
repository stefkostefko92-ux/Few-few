import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const COOKIE = "plf_session";
const MAX_AGE = 60 * 60 * 8; // 8 часа

export type Role = "OWNER" | "MEMBER";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET липсва или е твърде кратък (нужни са поне 32 знака). Задай дълъг случаен низ в .env (напр. openssl rand -base64 48).",
    );
  }
  if (/ПРОМЕНИ_МЕ|CHANGE_?ME|changeme/i.test(s)) {
    throw new Error(
      "AUTH_SECRET все още е примерната стойност. Задай истински дълъг случаен низ.",
    );
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// „Версия на паролата" — къс отпечатък на bcrypt хеша. Влиза в JWT-то, за да
// станат невалидни ВСИЧКИ стари сесии при смяна/нулиране на паролата (иначе
// компрометирана сесия живее до 8 ч. след reset). Не издава нищо за паролата.
function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function createSession(user: SessionUser): Promise<void> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) throw new Error("Потребителят не е намерен.");
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    pv: passwordVersion(dbUser.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    // Не се доверяваме на role/active от подписания токен (живее 8h): зареждаме
    // потребителя на живо, за да важат веднага деактивиране/изтриване/смяна на
    // роля. Membership-достъпът и без това се чете свежо от базата.
    const dbUser = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        passwordHash: true,
      },
    });
    if (!dbUser || !dbUser.active) return null;
    // Токен, издаден преди смяна на паролата, е невалиден (виж passwordVersion).
    if (payload.pv !== passwordVersion(dbUser.passwordHash)) return null;
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role === "OWNER" ? "OWNER" : "MEMBER",
    };
  } catch {
    return null;
  }
}

// Изисква валидна сесия; иначе пренасочва към входа.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// Изисква роля OWNER; иначе пренасочва.
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/dashboard");
  return user;
}
