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

export interface RefreshClaims {
  sub: string;
  /** Версия на сесиите (User.tokenVersion) при издаване; липсва в стари токени → 0. */
  tv?: number;
  iat?: number;
}

/** Access claims + стандартното `iat` (сек.), нужно за денилиста по време. */
export type VerifiedAccessClaims = AccessTokenClaims & { iat?: number };

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SEC, algorithm: "HS256" });
}

export function signRefreshToken(userId: string, tokenVersion = 0): string {
  return jwt.sign({ sub: userId, tv: tokenVersion } satisfies RefreshClaims, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SEC,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): VerifiedAccessClaims {
  // Pin the algorithm so a forged token can't downgrade to `alg:none` or trigger
  // an HS/RS algorithm-confusion attack.
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as VerifiedAccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] }) as RefreshClaims;
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
