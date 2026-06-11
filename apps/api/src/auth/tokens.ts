import jwt from "jsonwebtoken";
import type { Response } from "express";
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_SEC,
  type AccessTokenClaims,
} from "@aso/shared";
import { env } from "../env.js";

interface RefreshClaims {
  sub: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SEC });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies RefreshClaims, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SEC,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
}

/** Cookie options: httpOnly + Secure (prod) + SameSite (S14). Never localStorage. */
function cookieBase() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...cookieBase(),
    maxAge: ACCESS_TOKEN_TTL_SEC * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase(),
    // Refresh is only ever called same-origin by the SPA; strict closes the
    // residual CSRF surface on the long-lived credential.
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
    path: "/api/auth", // refresh cookie only sent to auth endpoints
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase() });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: "/api/auth" });
}
