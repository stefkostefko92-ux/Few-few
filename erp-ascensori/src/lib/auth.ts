// Сесии: къс access token (JWT, cookie) + refresh token в базата.
// Нивото на достъп се проверява на ВСЯКА заявка от сървъра — не от интерфейса.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { haPermesso, isRuolo, type Ruolo } from "@/lib/roles";

export const SESSION_COOKIE = "ea_session";
export const REFRESH_COOKIE = "ea_refresh";

const ACCESS_TTL_MIN = Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 15);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);

function segreto(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET mancante o troppo corto (min 32)");
  return new TextEncoder().encode(s);
}

export interface Sessione {
  sub: string; // user id
  ruolo: Ruolo;
  nome: string;
  tenantId: string | null;
}

export async function creaAccessToken(s: Sessione): Promise<string> {
  return new SignJWT({ ruolo: s.ruolo, nome: s.nome, tenantId: s.tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_MIN}m`)
    .sign(segreto());
}

/** Проверява JWT от cookie-то; null при липса/невалидност. */
export async function sessioneCorrente(): Promise<Sessione | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segreto());
    if (!payload.sub || !isRuolo(payload.ruolo)) return null;
    return {
      sub: payload.sub,
      ruolo: payload.ruolo,
      nome: typeof payload.nome === "string" ? payload.nome : "",
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
    };
  } catch {
    return null;
  }
}

/** Refresh токен: случаен, в базата стои само SHA-256 отпечатък. */
export function generaRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashRefresh(token) };
}

export function hashRefresh(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshScadenza(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
}

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function scriviCookieSessione(access: string, refresh: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, access, { ...COOKIE_BASE, maxAge: ACCESS_TTL_MIN * 60 });
  jar.set(REFRESH_COOKIE, refresh, {
    ...COOKIE_BASE,
    maxAge: REFRESH_TTL_DAYS * 86_400,
    // само маршрутът за подновяване вижда refresh token-а
    path: "/api/auth",
  });
}

export async function cancellaCookieSessione(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.set(REFRESH_COOKIE, "", { ...COOKIE_BASE, maxAge: 0, path: "/api/auth" });
}

export class ErroreHttp extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Изисква валидна сесия; хвърля 401. */
export async function richiedeSessione(): Promise<Sessione> {
  const s = await sessioneCorrente();
  if (!s) throw new ErroreHttp(401, "Non autenticato");
  return s;
}

/** Изисква минимално ниво; хвърля 403 при недостиг. */
export async function richiedeRuolo(minimo: Ruolo): Promise<Sessione> {
  const s = await richiedeSessione();
  if (!haPermesso(s.ruolo, minimo)) throw new ErroreHttp(403, "Permessi insufficienti");
  // мулти-фирма: изтекъл абонамент → 402 (проверка при наличен tenant)
  if (s.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: s.tenantId } });
    if (!t || !t.attivo) throw new ErroreHttp(403, "Azienda disattivata");
    if (t.scadenzaAbbonamento && t.scadenzaAbbonamento < new Date())
      throw new ErroreHttp(402, "Abbonamento scaduto");
  }
  return s;
}
