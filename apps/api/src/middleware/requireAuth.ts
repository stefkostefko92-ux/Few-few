import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ACCESS_COOKIE, type AccessTokenClaims } from "@aso/shared";
import { verifyAccessToken } from "../auth/tokens.js";
import { forbidden, unauthorized } from "../http.js";

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

/** Gate a route to one of the given roles (authz, §14). Use after requireAuth. */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      next(forbidden("Insufficient role"));
      return;
    }
    next();
  };
}
