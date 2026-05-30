import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE, type AccessTokenClaims } from "@aso/shared";
import { verifyAccessToken } from "../auth/tokens.js";
import { unauthorized } from "../http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
    }
  }
}

/** Reads the httpOnly access cookie, verifies it, attaches claims to req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) {
    next(unauthorized("Missing access token"));
    return;
  }
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
