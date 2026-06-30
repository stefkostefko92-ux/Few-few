import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const COOKIE = "zbd_session";
const MAX_AGE = 60 * 60 * 8; // 8 часа

export type Role = "ADMIN" | "EDITOR";
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

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
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
    // Админ зоната е отделна — strict пази най-добре срещу CSRF.
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
  let sub: string;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    sub = String(payload.sub);
  } catch {
    return null;
  }
  // Сверяваме сесията с базата: деактивиран или изтрит потребител губи достъп
  // веднага (не чак при изтичане на токена след 8 ч.), а ролята се чете от
  // базата, за да е винаги актуална (а не „замразена“ в стария токен).
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}

// За използване в admin server компоненти/действия.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/admin?error=forbidden");
  return user;
}

// Проверка на идентификационни данни при вход.
export async function authenticate(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}
